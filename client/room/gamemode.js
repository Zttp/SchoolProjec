import { DisplayValueHeader, Color, Vector3 } from 'pixel_combats/basic';
import { Game, Players, Inventory, LeaderBoard, BuildBlocksSet, Teams, Damage, BreackGraph, Ui, Properties, GameMode, Spawns, Timers, TeamsBalancer, AreaService, AreaPlayerTriggerService, AreaViewService, Chat } from 'pixel_combats/room';

// ========== CONSTANTS AND SETTINGS ==========
const WAITING_TIME = 10;  // Waiting for players (sec)
const DISCUSSION_TIME = 45; // Discussion time (sec)
const VOTING_TIME = 30;  // Voting time (sec)
const GAME_TIME = 600;   // Main game time (sec)
const END_TIME = 30;     // Match end time (sec)

// Team colors
const PLAYERS_COLOR = new Color(0, 0, 1, 0);    // Blue
const GHOSTS_COLOR = new Color(0.5, 0.5, 0.5, 0.5); // Gray (Ghosts)
const IMPOSTER_COLOR = new Color(1, 0, 0, 0);   // Red (Imposter)

// Game states
const GameStates = {
    WAITING: "WaitingPlayers",
    DISCUSSION: "Discussion",
    VOTING: "Voting", 
    GAME: "GameMode",
    END: "EndOfMatch"
};

// ========== GLOBAL VARIABLES ==========
const gameMode = {
    state: GameStates.WAITING,
    imposters: [],
    roundTime: GAME_TIME,
    imposterKillCooldown: 30,
    lastKillTime: 0,
    adminId: "D411BD94CAE31F89",
    playerRoles: new Map(),
    votes: new Map(),
    reportedBody: null,
    emergencyMeetingCalled: false,
    meetingCooldown: 60
};

// Contexts
const Inv = Inventory.GetContext();
const Sp = Spawns.GetContext();
const Dmg = Damage.GetContext();
const Props = Properties.GetContext();

// ========== MAIN FUNCTIONS ==========

// Initialize server properties
function initServerProperties() {
    Props.Get('Time_Hours').Value = 0;
    Props.Get('Time_Minutes').Value = 0;
    Props.Get('Time_Seconds').Value = 0;
    Props.Get('Players_Now').Value = 0;
    Props.Get('Players_WereMax').Value = 24;
    Props.Get('Time_FixedString').Value = '00:00:00';
    Props.Get('Round_Time').Value = gameMode.roundTime;
    Props.Get('Game_State').Value = gameMode.state;
    Props.Get('Imposters_Count').Value = 0;
}

function initServerTimer() {
    const serverTimer = Timers.GetContext().Get("Server");
    serverTimer.OnTimer.Add(function(t) {
        Props.Get('Time_Seconds').Value++;
        
        if (Props.Get('Time_Seconds').Value >= 60) {
            Props.Get('Time_Seconds').Value = 0;
            Props.Get('Time_Minutes').Value++;
        }
        
        if (Props.Get('Time_Minutes').Value >= 60) {
            Props.Get('Time_Minutes').Value = 0;
            Props.Get('Time_Hours').Value++;
        }
        
        Props.Get('Players_Now').Value = Players.All.length;
        
        if (Props.Get('Players_Now').Value > Props.Get('Players_WereMax').Value) {
            Props.Get('Players_WereMax').Value = Props.Get('Players_Now').Value;
        }
        
        Props.Get('Time_FixedString').Value = 
            `${Props.Get('Time_Hours').Value.toString().padStart(2, '0')}:` +
            `${Props.Get('Time_Minutes').Value.toString().padStart(2, '0')}:` +
            `${Props.Get('Time_Seconds').Value.toString().padStart(2, '0')}`;
        
        serverTimer.RestartLoop(1);
    });
    serverTimer.RestartLoop(1);
}

// Setup teams
function setupTeams() {
    Teams.Add('Players', 'Игроки', PLAYERS_COLOR);
    Teams.Add('Ghosts', 'Призраки', GHOSTS_COLOR);

    const PlayersTeam = Teams.Get('Players');
    const GhostsTeam = Teams.Get('Ghosts');

    // Spawn settings
    PlayersTeam.Spawns.SpawnPointsGroups.Add(1);
    GhostsTeam.Spawns.SpawnPointsGroups.Add(2);

    // Ghosts can't deal damage
    GhostsTeam.Damage.DamageOut.Value = false;

    return { PlayersTeam, GhostsTeam };
}

const { PlayersTeam, GhostsTeam } = setupTeams();

// Game state management
function setGameState(newState) {
    gameMode.state = newState;
    Props.Get('Game_State').Value = newState;
    
    const mainTimer = Timers.GetContext().Get("Main");
    
    switch(newState) {
        case GameStates.WAITING:
            Ui.GetContext().Hint.Value = "Ожидание игроков...";
            Sp.Enable = false;
            mainTimer.Restart(WAITING_TIME);
            break;
            
        case GameStates.DISCUSSION:
            Ui.GetContext().Hint.Value = "Обсуждение! Чат открыт для всех.";
            Inv.Main.Value = false;
            Inv.Secondary.Value = false;
            Inv.Melee.Value = false;
            Inv.Build.Value = false;
            Dmg.DamageOut.Value = false;
            Sp.Enable = true;
            Sp.Spawn();
            mainTimer.Restart(DISCUSSION_TIME);
            break;
            
        case GameStates.VOTING:
            Ui.GetContext().Hint.Value = "Голосование! Напишите /vote [ID] в чате.";
            mainTimer.Restart(VOTING_TIME);
            break;
            
        case GameStates.GAME:
            Ui.GetContext().Hint.Value = "Игра началась! Предатели могут убивать!";
            Inv.Main.Value = true;
            Inv.Secondary.Value = false;
            Inv.Melee.Value = true;
            Inv.Build.Value = false;
            
            // Only imposters can deal damage
            Players.All.forEach(player => {
                player.Damage.DamageOut.Value = gameMode.playerRoles.get(player.id) === 'Imposter';
            });
            
            Sp.Enable = true;
            Sp.Spawn();
            mainTimer.Restart(GAME_TIME);
            break;
            
        case GameStates.END:
            Ui.GetContext().Hint.Value = "Матч окончен!";
            Sp.Enable = false;
            mainTimer.Restart(END_TIME);
            break;
    }
}

// Round timer
function startRoundTimer() {
    const roundTimer = Timers.GetContext().Get("Round");
    roundTimer.OnTimer.Add(function(t) {
        gameMode.roundTime--;
        Props.Get('Round_Time').Value = gameMode.roundTime;
        
        if (gameMode.roundTime <= 0) {
            endRound('imposters');
            return;
        }
        
        roundTimer.RestartLoop(1);
    });
    roundTimer.RestartLoop(1);
}

// ========== IMPOSTER SYSTEM ==========

function selectImposters() {
    const players = PlayersTeam.Players;
    gameMode.imposters = [];
    gameMode.playerRoles.clear();
    
    // Select about 20% of players as imposters (min 1)
    const imposterCount = Math.max(1, Math.floor(players.length * 0.2));
    Props.Get('Imposters_Count').Value = imposterCount;
    
    // Shuffle players array
    const shuffledPlayers = [...players].sort(() => 0.5 - Math.random());
    
    // Select imposters
    for (let i = 0; i < imposterCount; i++) {
        const imposterId = shuffledPlayers[i].id;
        gameMode.imposters.push(imposterId);
        gameMode.playerRoles.set(imposterId, 'Imposter');
        
        const imposter = Players.Get(imposterId);
        if (imposter) {
            imposter.Ui.Hint.Value = "ТЫ ПРЕДАТЕЛЬ! Убивай игроков и останься незамеченным!";
            imposter.contextedProperties.SkinType.Value = 4; // Red color for imposters
            imposter.Properties.Get('Role').Value = 'Игрок'; // Hide role
        }
    }
    
    // Set other players as crewmates
    players.forEach(player => {
        if (!gameMode.imposters.includes(player.id)) {
            gameMode.playerRoles.set(player.id, 'Crewmate');
            player.Properties.Get('Role').Value = 'Игрок';
            player.contextedProperties.SkinType.Value = 0; // Default color
        }
    });
}

// ========== VOTING SYSTEM ==========

function startVoting() {
    gameMode.votes.clear();
    Players.All.forEach(player => {
        player.Ui.Hint.Value = "Голосование началось! Напишите /vote [ID] в чате";
    });
}

function processVotes() {
    const voteCounts = {};
    
    // Count votes
    gameMode.votes.forEach((votedId, voterId) => {
        if (votedId === 'skip') {
            voteCounts['skip'] = (voteCounts['skip'] || 0) + 1;
        } else {
            voteCounts[votedId] = (voteCounts[votedId] || 0) + 1;
        }
    });
    
    // Find player with most votes
    let maxVotes = 0;
    let ejectedPlayerId = null;
    
    for (const [playerId, count] of Object.entries(voteCounts)) {
        if (count > maxVotes) {
            maxVotes = count;
            ejectedPlayerId = playerId;
        }
    }
    
    // Skip if no majority or 'skip' has most votes
    if (maxVotes === 0 || ejectedPlayerId === 'skip') {
        room.Ui.Hint.Value = "Голосование завершено. Никто не изгнан.";
        setGameState(GameStates.GAME);
        return;
    }
    
    // Eject player
    const ejectedPlayer = Players.Get(ejectedPlayerId);
    if (ejectedPlayer) {
        // Move to ghosts team
        PlayersTeam.Remove(ejectedPlayer);
        GhostsTeam.Add(ejectedPlayer);
        
        // Check if ejected player was imposter
        const wasImposter = gameMode.playerRoles.get(ejectedPlayerId) === 'Imposter';
        
        room.Ui.Hint.Value = wasImposter 
            ? `${ejectedPlayer.NickName} был предателем!` 
            : `${ejectedPlayer.NickName} был невиновен!`;
        
        // Remove from imposters list if needed
        if (wasImposter) {
            gameMode.imposters = gameMode.imposters.filter(id => id !== ejectedPlayerId);
            Props.Get('Imposters_Count').Value = gameMode.imposters.length;
        }
        
        // Check win conditions
        if (gameMode.imposters.length === 0) {
            endRound('crewmates');
        } else if (gameMode.imposters.length >= PlayersTeam.Players.length) {
            endRound('imposters');
        } else {
            setGameState(GameStates.GAME);
        }
    } else {
        room.Ui.Hint.Value = "Голосование завершено. Никто не изгнан.";
        setGameState(GameStates.GAME);
    }
}

// ========== LEADERBOARD ==========
function setupLeaderboard() {
    LeaderBoard.PlayerLeaderBoardValues = [
        new DisplayValueHeader('Role', 'Роль', 'Роль'),
        new DisplayValueHeader('IdInRoom', 'ID', 'ID'),
        new DisplayValueHeader('Kills', 'Убийства', 'Убийства'),
        new DisplayValueHeader('Deaths', 'Смерти', 'Смерти')
    ];

    LeaderBoard.PlayersWeightGetter.Set(function(p) {
        return p.Properties.Get('Kills').Value;
    });
}

// ========== PLAYER INITIALIZATION ==========
function initPlayer(player) {
    player.Properties.Get('Role').Value = 'Игрок';
    player.Properties.Get('Kills').Value = 0;
    player.Properties.Get('Deaths').Value = 0;
    
    // Set player color based on team
    if (player.Team.Name === 'Ghosts') {
        player.contextedProperties.SkinType.Value = 5; // Ghost color
    } else {
        // Imposters will get their color in selectImposters()
        player.contextedProperties.SkinType.Value = 0; // Default color
    }
    
    // Give weapons to all players
    player.Inventory.Main.Value = true;
    player.Inventory.Melee.Value = true;
    
    // Only imposters can deal damage
    player.Damage.DamageOut.Value = gameMode.playerRoles.get(player.id) === 'Imposter';
}

// ========== KILL HANDLING ==========
function handleKill(killer, victim) {
    if (!killer || !victim) return;
    
    // Check if killer is imposter
    if (gameMode.playerRoles.get(killer.id) !== 'Imposter') {
        killer.Ui.Hint.Value = "Ты не можешь убивать!";
        return;
    }
    
    // Check kill cooldown
    const now = Props.Get('Time_Seconds').Value;
    if (now - gameMode.lastKillTime < gameMode.imposterKillCooldown) {
        killer.Ui.Hint.Value = `Подожди ${gameMode.imposterKillCooldown - (now - gameMode.lastKillTime)} сек.`;
        return;
    }
    
    // Move victim to ghosts team
    PlayersTeam.Remove(victim);
    GhostsTeam.Add(victim);
    
    killer.Properties.Kills.Value++;
    victim.Properties.Deaths.Value++;
    gameMode.lastKillTime = now;
    
    // Check win conditions
    if (gameMode.imposters.length >= PlayersTeam.Players.length) {
        endRound('imposters');
    }
}

// ========== REPORT BODY ==========
function reportBody(reporter, body) {
    if (gameMode.state !== GameStates.GAME) return;
    
    gameMode.reportedBody = body;
    room.Ui.Hint.Value = `${reporter.NickName} сообщил о теле! Начинается обсуждение.`;
    setGameState(GameStates.DISCUSSION);
}

// ========== EMERGENCY MEETING ==========
function callEmergencyMeeting(caller) {
    if (gameMode.state !== GameStates.GAME) return;
    if (gameMode.emergencyMeetingCalled) {
        caller.Ui.Hint.Value = "Экстренное собрание уже было использовано!";
        return;
    }
    
    gameMode.emergencyMeetingCalled = true;
    room.Ui.Hint.Value = `${caller.NickName} вызвал экстренное собрание!`;
    setGameState(GameStates.DISCUSSION);
}

// ========== ROUND END ==========
function endRound(winningTeam) {
    if (winningTeam === 'imposters') {
        room.Ui.Hint.Value = "Предатели побеждают!";
        
        // Reward imposters
        gameMode.imposters.forEach(imposterId => {
            const imposter = Players.Get(imposterId);
            if (imposter) {
                imposter.Properties.Scores.Value += 1000;
            }
        });
    } 
    else if (winningTeam === 'crewmates') {
        room.Ui.Hint.Value = "Игроки побеждают!";
        
        // Reward crewmates
        PlayersTeam.Players.forEach(player => {
            if (gameMode.playerRoles.get(player.id) === 'Crewmate') {
                player.Properties.Scores.Value += 1000;
            }
        });
    } 
    else {
        room.Ui.Hint.Value = 'Раунд окончен! Ничья!';
    }
    
    setGameState(GameStates.END);
}

// ========== NEW ROUND ==========
function startNewRound() {
    gameMode.roundTime = GAME_TIME;
    Props.Get('Round_Time').Value = gameMode.roundTime;
    gameMode.imposters = [];
    gameMode.playerRoles.clear();
    gameMode.votes.clear();
    gameMode.reportedBody = null;
    gameMode.emergencyMeetingCalled = false;
    gameMode.lastKillTime = 0;
    
    // Reset all players to Players team
    Players.All.forEach(player => {
        if (player.Team.Name !== 'Players') {
            player.Team.Remove(player);
            PlayersTeam.Add(player);
        }
    });
    
    setGameState(GameStates.WAITING);
}

// ========== CHAT COMMANDS ==========
function initChatCommands() {
    Chat.OnMessage.Add(function(m) {
        const msg = m.Text.trim();
        const sender = Players.GetByRoomId(m.Sender);
        if (!sender) return;

        const args = msg.split(' ');
        const command = args[0].toLowerCase();

        if (command === '/help') {
            sender.Ui.Hint.Value = `Доступные команды:
/report - сообщить о теле (возле тела)
/meeting - вызвать экстренное собрание
/vote [id] - проголосовать за игрока (во время голосования)
/vote skip - пропустить голосование`;
        }
        
        else if (command === '/report') {
            if (gameMode.state !== GameStates.GAME) {
                sender.Ui.Hint.Value = "Можно сообщать о телах только во время игры!";
                return;
            }
            
            if (sender.Team.Name === 'Ghosts') {
                sender.Ui.Hint.Value = "Призраки не могут сообщать о телах!";
                return;
            }
            
            // Find nearby body
            let nearestBody = null;
            let minDist = 5; // Max distance to report
            
            Players.All.forEach(player => {
                if (!player.IsAlive.Value && player.Team.Name === 'Players') {
                    const dist = sender.Position.sub(player.Position).length;
                    if (dist < minDist) {
                        minDist = dist;
                        nearestBody = player;
                    }
                }
            });
            
            if (nearestBody) {
                reportBody(sender, nearestBody);
            } else {
                sender.Ui.Hint.Value = "Рядом нет тел!";
            }
        }
        
        else if (command === '/meeting') {
            if (gameMode.state !== GameStates.GAME) {
                sender.Ui.Hint.Value = "Можно вызывать собрание только во время игры!";
                return;
            }
            
            if (sender.Team.Name === 'Ghosts') {
                sender.Ui.Hint.Value = "Призраки не могут вызывать собрания!";
                return;
            }
            
            callEmergencyMeeting(sender);
        }
        
        else if (command === '/vote') {
            if (gameMode.state !== GameStates.VOTING) {
                sender.Ui.Hint.Value = "Сейчас не время голосования!";
                return;
            }
            
            if (sender.Team.Name === 'Ghosts') {
                sender.Ui.Hint.Value = "Призраки не могут голосовать!";
                return;
            }
            
            if (args.length < 2) {
                sender.Ui.Hint.Value = "Использование: /vote [ID] или /vote skip";
                return;
            }
            
            const vote = args[1].toLowerCase();
            
            if (vote === 'skip') {
                gameMode.votes.set(sender.id, 'skip');
                sender.Ui.Hint.Value = "Вы решили пропустить голосование.";
                return;
            }
            
            const votedPlayer = Players.GetByRoomId(Number(vote));
            if (!votedPlayer || votedPlayer.Team.Name !== 'Players') {
                sender.Ui.Hint.Value = "Неверный ID игрока!";
                return;
            }
            
            gameMode.votes.set(sender.id, votedPlayer.id);
            sender.Ui.Hint.Value = `Вы проголосовали за ${votedPlayer.NickName}`;
        }
        
        // Admin commands
        else if (command === '/imposter') {
            if (sender.id !== gameMode.adminId) {
                sender.Ui.Hint.Value = "❌ Недостаточно прав!";
                return;
            }
            
            if (args.length < 2) {
                sender.Ui.Hint.Value = "Использование: /imposter [ID]";
                return;
            }
            
            const target = Players.GetByRoomId(Number(args[1]));
            if (!target) {
                sender.Ui.Hint.Value = "Игрок не найден!";
                return;
            }
            
            // Make player imposter
            gameMode.playerRoles.set(target.id, 'Imposter');
            gameMode.imposters.push(target.id);
            Props.Get('Imposters_Count').Value = gameMode.imposters.length;
            
            target.contextedProperties.SkinType.Value = 4; // Red color
            target.Damage.DamageOut.Value = true;
            target.Ui.Hint.Value = "Теперь ты предатель!";
            sender.Ui.Hint.Value = `${target.NickName} теперь предатель`;
        }
    });
}

// ========== EVENT HANDLERS ==========
function setupEventHandlers() {
    // Player connected
    Players.OnPlayerConnected.Add(function(player) {
        initPlayer(player);
        player.Ui.Hint.Value = 'Добро пожаловать в Among Us режим! Напишите /help';
        
        if (Players.All.length >= 4 && gameMode.state === GameStates.WAITING) {
            selectImposters();
            setGameState(GameStates.GAME);
        }
    });
    
    // Team change
    Teams.OnPlayerChangeTeam.Add(function(player) {
        initPlayer(player);
        player.Spawns.Spawn();
    });
    
    // Kill
    Damage.OnKill.Add(handleKill);
    
    // Death
    Damage.OnDeath.Add(function(player) {
        player.Properties.Deaths.Value++;
        player.Spawns.Despawn();
        
        // Move to ghosts team after short delay
        Timers.GetContext(player).Get("GhostTimer").Restart(3, () => {
            if (player.Team.Name !== 'Ghosts') {
                player.Team.Remove(player);
                GhostsTeam.Add(player);
            }
        });
    });
    
    // Main game timer
    const mainTimer = Timers.GetContext().Get("Main");
    mainTimer.OnTimer.Add(function() {
        switch(gameMode.state) {
            case GameStates.WAITING:
                if (Players.All.length >= 4) {
                    selectImposters();
                    setGameState(GameStates.GAME);
                } else {
                    mainTimer.Restart(WAITING_TIME);
                }
                break;
                
            case GameStates.DISCUSSION:
                startVoting();
                setGameState(GameStates.VOTING);
                break;
                
            case GameStates.VOTING:
                processVotes();
                break;
                
            case GameStates.END:
                startNewRound();
                break;
        }
    });
}

// ========== GAME INITIALIZATION ==========
function initGameMode() {
    Dmg.DamageOut.Value = false; // Disable damage by default
    Dmg.FriendlyFire.Value = false;
    BreackGraph.OnlyPlayerBlocksDmg = true;
    
    initServerProperties();
    initServerTimer();
    setupLeaderboard();
    initChatCommands();
    setupEventHandlers();
    startNewRound();
}

// START GAME
initGameMode();
