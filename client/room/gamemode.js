import { DisplayValueHeader, Color, Vector3 } from 'pixel_combats/basic';
import { Game, Players, Inventory, LeaderBoard, BuildBlocksSet, Teams, Damage, BreackGraph, Ui, Properties, GameMode, Spawns, Timers, TeamsBalancer, AreaService, AreaPlayerTriggerService, AreaViewService, Chat } from 'pixel_combats/room';

// Настройки режима
const WAITING_TIME = 10;      // Ожидание игроков
const INTRODUCTION_TIME = 30;  // Введение в историю
const CLUE_TIME = 300;        // Время сбора улик
const RIDDLE_TIME = 180;      // Время решения загадок
const FINAL_TIME = 120;       // Финальное противостояние
const EPILOGUE_TIME = 60;     // Развязка

// Цвета команд (классов)
const class5AColor = new Color(0, 0.5, 1, 0);    // Голубой - 5А
const class6BColor = new Color(1, 0.8, 0, 0);     // Оранжевый - 6Б
const class7VColor = new Color(0.5, 0, 1, 0);     // Фиолетовый - 7В

// Контексты
const Inv = Inventory.GetContext();
const Sp = Spawns.GetContext();
const Dmg = Damage.GetContext();
const Props = Properties.GetContext();

// Персонажи и состояния игры
const Characters = {
    GHOST: "Призрак",
    DETECTIVE: "Детектив",
    LIBRARIAN: "Библиотекарь",
    JANITOR: "Уборщик",
    OLD_TEACHER: "Старый учитель",
    STUDENT: "Ученик",
    TEACHER: "Учитель",
    DIRECTOR: "Директор"
};

const GameStates = {
    WAITING: "Ожидание игроков",
    INTRODUCTION: "Введение в историю",
    GHOST_APPEARANCE: "Появление призрака",
    CLUE_COLLECTION: "Сбор улик",
    PUZZLE_SOLVING: "Решение головоломок",
    FINAL_CONFRONTATION: "Финал",
    EPILOGUE: "Развязка"
};

// Глобальные переменные
const schoolMode = {
    state: GameStates.WAITING,
    roles: {},                  // {playerId: role}
    playerData: {},             // {playerId: {energy, hunger, scores, inventory, class}}
    punishments: {},            // {playerId: punishmentTimer}
    quests: {
        currentQuest: 0,
        allQuests: [
            {
                title: "Пропавший учебник",
                description: "Найдите первый пропавший учебник в библиотеке",
                target: "library",
                completed: false,
                reward: 100
            },
            {
                title: "Загадка старого учителя",
                description: "Поговорите с мистером Брауном в библиотеке",
                target: "library",
                completed: false,
                reward: 150
            },
            {
                title: "След в подвале",
                description: "Исследуйте подвал школы",
                target: "detention",
                completed: false,
                reward: 200
            }
        ],
        clues: [],
        riddles: [
            {q: "Я не живой, но я могу умереть. Что я?", a: "огонь"},
            {q: "Чем больше берешь, тем больше оставляешь. Что я?", a: "шаги"},
            {q: "Виден, но не слышен. Говорит, но не дышит. Что это?", a: "эхо"}
        ]
    },
    schoolZones: {
        classroom: {center: new Vector3(0, 0, 0), radius: 15},
        gym: {center: new Vector3(30, 0, 0), radius: 20},
        cafeteria: {center: new Vector3(0, 0, 30), radius: 15},
        library: {center: new Vector3(-30, 0, 0), radius: 15},
        yard: {center: new Vector3(0, 0, -30), radius: 25},
        detention: {center: new Vector3(0, -10, 0), radius: 5},
        auditorium: {center: new Vector3(-30, 0, 30), radius: 20},
        playground: {center: new Vector3(30, 0, -30), radius: 25}
    },
    ghost: null,
    adminId: "D411BD94CAE31F89" // ID администратора
};

// Основные таймеры
const mainTimer = Timers.GetContext().Get("Main");
const serverTimer = Timers.GetContext().Get("Server");
const scheduleTimer = Timers.GetContext().Get("Schedule");

// Инициализация сервера
function initServerProperties() {
    Props.Get('Time_Hours').Value = 8;
    Props.Get('Time_Minutes').Value = 0;
    Props.Get('Time_Seconds').Value = 0;
    Props.Get('School_Score').Value = 0;
    Props.Get('Game_State').Value = schoolMode.state;
    Props.Get('Current_Clue').Value = "";
    Props.Get('Current_Riddle').Value = "";
}

function initServerTimer() {
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
        
        Props.Get('Time_FixedString').Value = 
            `${Props.Get('Time_Hours').Value.toString().padStart(2, '0')}:` +
            `${Props.Get('Time_Minutes').Value.toString().padStart(2, '0')}`;
        
        serverTimer.RestartLoop(1);
    });
    serverTimer.RestartLoop(1);
}

// Создание классов
function setupClasses() {
    Teams.Add('5А', '5А класс', class5AColor);
    Teams.Add('6Б', '6Б класс', class6BColor);
    Teams.Add('7В', '7В класс', class7VColor);

    const Class5A = Teams.Get('5А');
    const Class6B = Teams.Get('6Б');
    const Class7V = Teams.Get('7В');

    // Настройки спавнов
    Class5A.Spawns.SpawnPointsGroups.Add(1);
    Class6B.Spawns.SpawnPointsGroups.Add(2);
    Class7V.Spawns.SpawnPointsGroups.Add(3);

    return { Class5A, Class6B, Class7V };
}

const { Class5A, Class6B, Class7V } = setupClasses();

// Настройка ботов-персонажей
function setupBots() {
    const bots = [
        { name: "Мистер Браун", role: Characters.OLD_TEACHER, spawn: "library", skin: 3 },
        { name: "Миссис Смит", role: Characters.LIBRARIAN, spawn: "library", skin: 4 },
        { name: "Джон-уборщик", role: Characters.JANITOR, spawn: "yard", skin: 5 },
        { name: "Детектив Картер", role: Characters.DETECTIVE, spawn: "auditorium", skin: 6 }
    ];

    bots.forEach(bot => {
        const npc = Players.CreateBot(bot.name);
        schoolMode.roles[npc.id] = bot.role;
        npc.Properties.Get('Role').Value = bot.role;
        npc.contextedProperties.SkinType.Value = bot.skin;
        npc.SetPosition(schoolMode.schoolZones[bot.spawn].center);
        npc.AI.Enabled = true;
        npc.AI.Wander = true;
        npc.AI.WanderRadius = 10;
    });
}

// Настройка призрака
function setupGhost() {
    schoolMode.ghost = Players.CreateBot("Тайный_Призрак");
    schoolMode.roles[schoolMode.ghost.id] = Characters.GHOST;
    schoolMode.ghost.Properties.Get('Role').Value = Characters.GHOST;
    schoolMode.ghost.contextedProperties.SkinType.Value = 7; // Особый скин призрака
    schoolMode.ghost.AI.Enabled = true;
    
    const ghostPoints = [
        schoolMode.schoolZones.library.center,
        schoolMode.schoolZones.detention.center,
        schoolMode.schoolZones.auditorium.center
    ];
    
    let currentPoint = 0;
    const ghostTimer = Timers.GetContext().Get("GhostMove");
    ghostTimer.OnTimer.Add(function() {
        schoolMode.ghost.SetPosition(ghostPoints[currentPoint]);
        currentPoint = (currentPoint + 1) % ghostPoints.length;
        
        if (Math.random() < 0.2) {
            const clue = "Призрак был здесь " + new Date().toLocaleTimeString();
            schoolMode.quests.clues.push(clue);
            room.Ui.Hint.Value = "💀 Призрак оставил след! Ищите улики!";
        }
        
        ghostTimer.RestartLoop(30);
    });
    ghostTimer.RestartLoop(30);
}

// Распределение ролей
function assignRoles() {
    const players = Players.All.filter(p => !p.IsBot);
    
    // Директор (1 человек)
    if (players.length > 0) {
        const director = players[0];
        schoolMode.roles[director.id] = Characters.DIRECTOR;
        director.Properties.Get('Role').Value = Characters.DIRECTOR;
        director.contextedProperties.SkinType.Value = 4;
        initPlayerData(director);
    }
    
    // Учителя (10% игроков)
    const teacherCount = Math.max(1, Math.floor(players.length * 0.1));
    for (let i = 0; i < teacherCount; i++) {
        if (players.length > i+1) {
            const teacher = players[i+1];
            schoolMode.roles[teacher.id] = Characters.TEACHER;
            teacher.Properties.Get('Role').Value = Characters.TEACHER;
            teacher.contextedProperties.SkinType.Value = 3;
            initPlayerData(teacher);
        }
    }
    
    // Остальные - ученики
    players.forEach(player => {
        if (!schoolMode.roles[player.id]) {
            schoolMode.roles[player.id] = Characters.STUDENT;
            player.Properties.Get('Role').Value = Characters.STUDENT;
            player.contextedProperties.SkinType.Value = Math.floor(Math.random() * 3);
            initPlayerData(player);
        }
    });
}

// Инициализация данных игрока
function initPlayerData(player) {
    if (!schoolMode.playerData[player.id]) {
        schoolMode.playerData[player.id] = {
            energy: 100,
            hunger: 0,
            scores: player.Properties.Scores.Value || 0,
            inventory: [],
            class: player.Team ? player.Team.Name : null
        };
    }
    
    player.Properties.Scores.Value = schoolMode.playerData[player.id].scores;
    player.Properties.Get('Role').Value = schoolMode.roles[player.id] || Characters.STUDENT;
    
    if (schoolMode.punishments[player.id]) {
        punishPlayer(player, "продолжение наказания", schoolMode.punishments[player.id]);
    }
}

// Управление состоянием игры
function setGameState(newState) {
    schoolMode.state = newState;
    Props.Get('Game_State').Value = newState;
    
    switch(newState) {
        case GameStates.WAITING:
            Ui.GetContext().Hint.Value = "Ожидание игроков...";
            Sp.Enable = true;
            mainTimer.Restart(WAITING_TIME);
            break;
            
        case GameStates.INTRODUCTION:
            Ui.GetContext().Hint.Value = "Добро пожаловать в школу! Начинается таинственное расследование...";
            Sp.Enable = true;
            player.Spawns.Spawn()
            mainTimer.Restart(INTRODUCTION_TIME);
            break;
            
        case GameStates.GHOST_APPEARANCE:
            Ui.GetContext().Hint.Value = "💀 В школе появился призрак! Он крадет учебники!";
            setupGhost();
            mainTimer.Restart(60);
            break;
            
        case GameStates.CLUE_COLLECTION:
            Ui.GetContext().Hint.Value = "Собирайте улики и разговаривайте с персонажами (/talk)";
            schoolMode.quests.currentQuest = 0;
            announceNewQuest();
            mainTimer.Restart(CLUE_TIME);
            break;
            
        case GameStates.PUZZLE_SOLVING:
            Ui.GetContext().Hint.Value = "Решайте загадки призрака! Используйте /answer чтобы отвечать";
            askGhostRiddle();
            mainTimer.Restart(RIDDLE_TIME);
            break;
            
        case GameStates.FINAL_CONFRONTATION:
            Ui.GetContext().Hint.Value = "Призрак в подвале! Последнее противостояние!";
            teleportGhostToDetention();
            mainTimer.Restart(FINAL_TIME);
            break;
            
        case GameStates.EPILOGUE:
            Ui.GetContext().Hint.Value = "История раскрыта! Призрак обрел покой...";
            endStory();
            mainTimer.Restart(EPILOGUE_TIME);
            break;
    }
}

// Анонс нового квеста
function announceNewQuest() {
    const quest = schoolMode.quests.allQuests[schoolMode.quests.currentQuest];
    if (quest) {
        room.Ui.Hint.Value = `📌 Новый квест: ${quest.title}\n${quest.description}`;
    }
}

// Задать загадку призрака
function askGhostRiddle() {
    if (schoolMode.quests.riddles.length > 0) {
        const randomRiddle = schoolMode.quests.riddles[Math.floor(Math.random() * schoolMode.quests.riddles.length)];
        Props.Get('Current_Riddle').Value = randomRiddle.q;
        room.Ui.Hint.Value = `💀 Загадка призрака: ${randomRiddle.q}\nИспользуйте /answer [ответ]`;
        schoolMode.quests.currentAnswer = randomRiddle.a;
    }
}

// Телепортация призрака в подвал для финала
function teleportGhostToDetention() {
    if (schoolMode.ghost) {
        schoolMode.ghost.SetPosition(schoolMode.schoolZones.detention.center);
        schoolMode.ghost.AI.Wander = false;
    }
}

// Завершение истории
function endStory() {
    // Награждение лучших сыщиков
    let bestDetective = null;
    let maxClues = 0;
    
    Players.All.forEach(player => {
        if (!player.IsBot && schoolMode.playerData[player.id]?.inventory?.length > maxClues) {
            maxClues = schoolMode.playerData[player.id].inventory.length;
            bestDetective = player;
        }
    });
    
    if (bestDetective) {
        schoolMode.playerData[bestDetective.id].scores += 500;
        bestDetective.Properties.Scores.Value = schoolMode.playerData[bestDetective.id].scores;
        room.Ui.Hint.Value = `🏆 Лучший сыщик: ${bestDetective.NickName} (нашел ${maxClues} улик) +500 очков!`;
    }
    
    // Удаление призрака
    if (schoolMode.ghost) {
        Players.Remove(schoolMode.ghost);
        schoolMode.ghost = null;
    }
}

// Проверка находится ли игрок в зоне
function isPlayerInZone(player, zoneName) {
    const zone = schoolMode.schoolZones[zoneName];
    if (!zone) return false;
    
    const distance = player.Position.sub(zone.center).length;
    return distance <= zone.radius;
}

// Проверка ответа на загадку
function checkAnswer(player, answer) {
    if (!schoolMode.quests.currentAnswer) return false;
    
    const normalizedAnswer = answer.trim().toLowerCase();
    if (normalizedAnswer === schoolMode.quests.currentAnswer) {
        schoolMode.playerData[player.id].scores += 200;
        player.Properties.Scores.Value = schoolMode.playerData[player.id].scores;
        player.Ui.Hint.Value = "✅ Правильно! Призрак ослаблен! +200 очков";
        schoolMode.quests.currentAnswer = null;
        Props.Get('Current_Riddle').Value = "";
        return true;
    }
    
    player.Ui.Hint.Value = "❌ Неправильно! Попробуй еще";
    return false;
}

// Система наказаний
function punishPlayer(player, reason, duration = 60) {
    player.SetPositionAndRotation(
        schoolMode.schoolZones.detention.center,
        player.Rotation
    );
    
    schoolMode.punishments[player.id] = duration;
    player.Ui.Hint.Value = `⛔ Вы наказаны за ${reason}! Осталось: ${duration} сек`;
}

// Система характеристик игроков
function updatePlayerStats() {
    Players.All.forEach(player => {
        if (player.IsBot) return;
        
        const playerData = schoolMode.playerData[player.id];
        if (!playerData) return;
        
        // Уменьшение энергии
        playerData.energy = Math.max(0, playerData.energy - 0.2);
        
        // Увеличение голода
        playerData.hunger = Math.min(100, playerData.hunger + 0.1);
        
        // Обновление UI
        player.Ui.Energy.Value = `⚡ ${Math.round(playerData.energy)}%`;
        player.Ui.Hunger.Value = `🍎 ${Math.round(playerData.hunger)}%`;
        
        // Эффекты при низких характеристиках
        if (playerData.energy < 20) {
            player.Ui.Hint.Value += "\n⚠️ Вы устали! Сходите в спортзал!";
        }
        
        if (playerData.hunger > 80) {
            player.Ui.Hint.Value += "\n⚠️ Вы голодны! Сходите в столовую!";
        }
        
        // Наказания
        if (schoolMode.punishments[player.id]) {
            schoolMode.punishments[player.id]--;
            if (schoolMode.punishments[player.id] <= 0) {
                delete schoolMode.punishments[player.id];
                player.Spawns.Spawn();
                player.Ui.Hint.Value = "Наказание окончено! Возвращайтесь к расследованию";
            }
        }
    });
}

// Обновление квестов
function updateQuests() {
    if (schoolMode.state !== GameStates.CLUE_COLLECTION) return;
    
    const quest = schoolMode.quests.allQuests[schoolMode.quests.currentQuest];
    if (!quest || quest.completed) return;
    
    Players.All.forEach(player => {
        if (player.IsBot) return;
        
        if (isPlayerInZone(player, quest.target)) {
            quest.completed = true;
            schoolMode.playerData[player.id].scores += quest.reward;
            player.Properties.Scores.Value = schoolMode.playerData[player.id].scores;
            player.Ui.Hint.Value = `✅ Квест "${quest.title}" завершен! +${quest.reward} очков`;
            
            // Добавление улики
            const clue = `Улика от квеста "${quest.title}"`;
            schoolMode.playerData[player.id].inventory.push(clue);
            schoolMode.quests.clues.push(clue);
            
            // Переход к следующему квесту
            schoolMode.quests.currentQuest++;
            if (schoolMode.quests.currentQuest >= schoolMode.quests.allQuests.length) {
                setGameState(GameStates.PUZZLE_SOLVING);
            } else {
                announceNewQuest();
            }
        }
    });
}

// Зоны школы
function setupSchoolZones() {
    // Библиотека (квесты)
    const libTrigger = AreaPlayerTriggerService.Get("library");
    libTrigger.Tags = ["library"];
    libTrigger.Enable = true;
    libTrigger.OnEnter.Add(function(player){
        const p = Players.Get(player.Id);
        if (!p || p.IsBot) return;
        
        if (schoolMode.state === GameStates.CLUE_COLLECTION) {
            p.Ui.Hint.Value = "Ищите улики и разговаривайте с персонажами (/talk)";
        }
    });
    
    // Подвал (финал)
    const detentionTrigger = AreaPlayerTriggerService.Get("detention");
    detentionTrigger.Tags = ["detention"];
    detentionTrigger.Enable = true;
    detentionTrigger.OnEnter.Add(function(player){
        const p = Players.Get(player.Id);
        if (!p || p.IsBot) return;
        
        if (schoolMode.state === GameStates.FINAL_CONFRONTATION) {
            p.Ui.Hint.Value = "💀 Призрак здесь! Используйте /answer чтобы разгадать его тайну!";
        }
    });
    
    // Визуализация зон
    const viewClass = AreaViewService.GetContext().Get("classroom");
    viewClass.Color = new Color(1, 1, 1, 0.3);
    viewClass.Tags = ["classroom"];
    viewClass.Enable = true;
    
    const viewGym = AreaViewService.GetContext().Get("gym");
    viewGym.Color = new Color(1, 0, 0, 0.3);
    viewGym.Tags = ["gym"];
    viewGym.Enable = true;
    
    const viewCafe = AreaViewService.GetContext().Get("cafeteria");
    viewCafe.Color = new Color(0, 1, 0, 0.3);
    viewCafe.Tags = ["cafeteria"];
    viewCafe.Enable = true;
    
    const viewLib = AreaViewService.GetContext().Get("library");
    viewLib.Color = new Color(0, 0, 1, 0.3);
    viewLib.Tags = ["library"];
    viewLib.Enable = true;
    
    const viewYard = AreaViewService.GetContext().Get("yard");
    viewYard.Color = new Color(1, 1, 0, 0.3);
    viewYard.Tags = ["yard"];
    viewYard.Enable = true;
    
    const viewDetention = AreaViewService.GetContext().Get("detention");
    viewDetention.Color = new Color(0.3, 0.3, 0.3, 0.5);
    viewDetention.Tags = ["detention"];
    viewDetention.Enable = true;
    
    const viewAuditorium = AreaViewService.GetContext().Get("auditorium");
    viewAuditorium.Color = new Color(1, 0, 1, 0.3);
    viewAuditorium.Tags = ["auditorium"];
    viewAuditorium.Enable = true;
    
    const viewPlayground = AreaViewService.GetContext().Get("playground");
    viewPlayground.Color = new Color(0, 1, 1, 0.3);
    viewPlayground.Tags = ["playground"];
    viewPlayground.Enable = true;
}

// Команды чата
function initChatCommands() {
    Chat.OnMessage.Add(function(m) {
        const msg = m.Text.trim();
        const sender = Players.GetByRoomId(m.Sender);
        if (!sender || sender.IsBot) return;

        const args = msg.split(' ');
        const command = args[0].toLowerCase();

        if (command === '/help') {
            let helpText = `📚 Команды расследования:
/answer [ответ] - ответить на загадку
/talk [имя NPC] - поговорить с персонажем
/clues - показать найденные улики
/scores - мои очки
/energy - моя энергия
/hunger - мой голод
/quest - текущий квест
/where - где я должен быть?`;

            if (schoolMode.roles[sender.id] === Characters.DIRECTOR) {
                helpText += `
/detention [id] - отправить в карцер
/announce [текст] - объявить всем`;
            }

            sender.Ui.Hint.Value = helpText;
        }
        
        else if (command === '/answer') {
            if (args.length < 2) {
                sender.Ui.Hint.Value = "Использование: /answer [ваш ответ]";
                return;
            }
            
            const answer = args.slice(1).join(' ');
            if (schoolMode.state === GameStates.PUZZLE_SOLVING || 
                schoolMode.state === GameStates.FINAL_CONFRONTATION) {
                checkAnswer(sender, answer);
            } else {
                sender.Ui.Hint.Value = "Сейчас не время отвечать на загадки!";
            }
        }
        
        else if (command === '/talk') {
            if (args.length < 2) {
                sender.Ui.Hint.Value = "Использование: /talk [имя NPC]";
                return;
            }

            const npcName = args.slice(1).join(' ');
            const npc = Players.All.find(p => p.NickName === npcName && p.IsBot);
            
            if (!npc) {
                sender.Ui.Hint.Value = "Этот персонаж не найден!";
                return;
            }

            const npcRole = schoolMode.roles[npc.id];
            const distance = sender.Position.sub(npc.Position).length;
            
            if (distance > 5) {
                sender.Ui.Hint.Value = "Подойдите ближе к персонажу!";
                return;
            }

            let response = "";
            switch(npcRole) {
                case Characters.OLD_TEACHER:
                    response = "Ах, призрак... Он был учеником 50 лет назад. Проверьте старые записи в библиотеке.";
                    addClueToPlayer(sender, "Призрак - бывший ученик");
                    break;
                case Characters.LIBRARIAN:
                    response = "Учебники пропадают каждую ночь! Вчера я видел, как один сам по себе летел в подвал!";
                    addClueToPlayer(sender, "Призрак ворует учебники ночью");
                    break;
                case Characters.JANITOR:
                    response = "В подвале странные звуки по ночам... Я туда не хожу после заката.";
                    addClueToPlayer(sender, "Подвал - логово призрака");
                    break;
                case Characters.DETECTIVE:
                    response = "Я расследую это дело. У меня есть теория - призрак ищет свою старую тетрадь с оценками.";
                    addClueToPlayer(sender, "Призрак ищет свою тетрадь");
                    break;
                default:
                    response = "Привет, чем могу помочь?";
            }

            sender.Ui.Hint.Value = `${npc.NickName}: "${response}"`;
        }
        
        else if (command === '/clues') {
            const playerData = schoolMode.playerData[sender.id];
            if (!playerData) return;
            
            if (playerData.inventory.length > 0) {
                sender.Ui.Hint.Value = "🔍 Ваши улики:\n" + playerData.inventory.join("\n- ");
            } else {
                sender.Ui.Hint.Value = "У вас пока нет улик! Ищите их по школе.";
            }
        }
        
        else if (command === '/scores') {
            const playerData = schoolMode.playerData[sender.id];
            sender.Ui.Hint.Value = `🏆 Ваши очки: ${playerData ? playerData.scores : 0}`;
        }
        
        else if (command === '/energy') {
            const playerData = schoolMode.playerData[sender.id];
            sender.Ui.Hint.Value = `⚡ Ваша энергия: ${playerData ? Math.round(playerData.energy) : 0}%`;
        }
        
        else if (command === '/hunger') {
            const playerData = schoolMode.playerData[sender.id];
            sender.Ui.Hint.Value = `🍎 Ваш голод: ${playerData ? Math.round(playerData.hunger) : 0}%`;
        }
        
        else if (command === '/quest') {
            const quest = schoolMode.quests.allQuests[schoolMode.quests.currentQuest];
            if (quest && !quest.completed) {
                sender.Ui.Hint.Value = `📌 Текущий квест: ${quest.title}\n${quest.description}`;
            } else {
                sender.Ui.Hint.Value = "Сейчас нет активных квестов. Ждите следующего этапа.";
            }
        }
        
        else if (command === '/where') {
            switch(schoolMode.state) {
                case GameStates.CLUE_COLLECTION:
                    const quest = schoolMode.quests.allQuests[schoolMode.quests.currentQuest];
                    sender.Ui.Hint.Value = quest ? 
                        `Вы должны быть в зоне "${quest.target}" для квеста "${quest.title}"` :
                        "Ищите улики по всей школе!";
                    break;
                case GameStates.PUZZLE_SOLVING:
                    sender.Ui.Hint.Value = "Решайте загадки призрака! Проверьте библиотеку и актовый зал.";
                    break;
                case GameStates.FINAL_CONFRONTATION:
                    sender.Ui.Hint.Value = "Призрак в подвале! Срочно туда!";
                    break;
                default:
                    sender.Ui.Hint.Value = "Следуйте общим указаниям!";
            }
        }
        
        else if (command === '/detention') {
            if (schoolMode.roles[sender.id] !== Characters.DIRECTOR) {
                sender.Ui.Hint.Value = "❌ Только директор может наказывать!";
                return;
            }
            
            if (args.length < 2) {
                sender.Ui.Hint.Value = "Использование: /detention [id игрока]";
                return;
            }
            
            const target = Players.GetByRoomId(Number(args[1]));
            if (!target) {
                sender.Ui.Hint.Value = "Игрок не найден!";
                return;
            }
            
            punishPlayer(target, "нарушение правил", 120);
            sender.Ui.Hint.Value = `⛔ ${target.NickName} отправлен в карцер!`;
        }
        
        else if (command === '/announce') {
            if (schoolMode.roles[sender.id] !== Characters.DIRECTOR) {
                sender.Ui.Hint.Value = "❌ Только директор может делать объявления!";
                return;
            }
            
            if (args.length < 2) {
                sender.Ui.Hint.Value = "Использование: /announce [текст]";
                return;
            }
            
            const announcement = args.slice(1).join(' ');
            room.Ui.Hint.Value = `📢 Директор объявляет: ${announcement}`;
        }
        
        else if (command === '/class') {
            if (args.length < 2) {
                sender.Ui.Hint.Value = "Доступные классы: 5А, 6Б, 7В";
                sender.Ui.Hint.Value += "\nИспользование: /class [название класса]";
                return;
            }
            
            const className = args[1];
            let targetTeam = null;
            
            if (className === "5А") targetTeam = Class5A;
            else if (className === "6Б") targetTeam = Class6B;
            else if (className === "7В") targetTeam = Class7V;
            
            if (!targetTeam) {
                sender.Ui.Hint.Value = "Недопустимый класс! Варианты: 5А, 6Б, 7В";
                return;
            }
            
            targetTeam.Add(sender);
            schoolMode.playerData[sender.id].class = className;
            sender.Ui.Hint.Value = `✅ Вы вступили в ${className} класс!`;
            initPlayerData(sender);
        }
    });
}

// Добавление улики игроку
function addClueToPlayer(player, clue) {
    if (!schoolMode.playerData[player.id].inventory.includes(clue)) {
        schoolMode.playerData[player.id].inventory.push(clue);
        schoolMode.quests.clues.push(clue);
        player.Ui.Hint.Value = `🔍 Вы получили улику: "${clue}"`;
    }
}

// Настройка лидерборда
function setupLeaderboard() {
    LeaderBoard.PlayerLeaderBoardValues = [
        new DisplayValueHeader('Role', 'Роль', 'Роль'),
        new DisplayValueHeader('Scores', 'Очки', 'Очки'),
        new DisplayValueHeader('Clues', 'Улики', 'Улики')
    ];

    LeaderBoard.PlayersWeightGetter.Set(function(p) {
        return p.Properties.Get('Scores').Value;
    });
}

// Обработчики событий
function setupEventHandlers() {
    // Обновление характеристик
    const statTimer = Timers.GetContext().Get("Stats");
    statTimer.OnTimer.Add(function() {
        updatePlayerStats();
        updateQuests();
        statTimer.RestartLoop(5);
    });
    statTimer.RestartLoop(5);
    
    Players.OnPlayerConnected.Add(function(player) {
        if (player.IsBot) return;
        
        // Проверка бана
        if (Props.Get(`Banned_${player.id}`).Value) {
            player.SetPositionAndRotation(
                schoolMode.schoolZones.detention.center,
                player.Rotation
            );
            player.Ui.Hint.Value = "⛔ Вы забанены!";
            return;
        }
        
        // Инициализация данных
        player.Properties.Get('Scores').Value = 0;
        player.Properties.Get('Role').Value = "Новичок";
        player.Ui.Hint.Value = 'Добро пожаловать в школу! Выберите класс: /class [5А|6Б|7В]';
        
        // Начало игры при достаточном количестве игроков
        if (Players.All.filter(p => !p.IsBot).length >= 1 && schoolMode.state === GameStates.WAITING) {
            setGameState(GameStates.INTRODUCTION);
            setupBots();
            assignRoles();
        }
    });
    
    Damage.OnKill.Add(function(killer, victim) {
        // Наказываем за убийства
        if (killer && !killer.IsBot) {
            punishPlayer(killer, "насилие в школе");
        }
    });
    
    Damage.OnDeath.Add(function(player, info) {
        if (player.IsBot) return;
        
        const playerData = schoolMode.playerData[player.id];
        if (playerData) {
            playerData.scores -= 15;
            player.Properties.Scores.Value = playerData.scores;
        }
        
        if (GameMode.Parameters.GetBool('AutoSpawn')) {
            player.Spawns.Spawn();
        }
    });
    
    // Обработчик основного таймера (сюжета)
    mainTimer.OnTimer.Add(function() {
        switch(schoolMode.state) {
            case GameStates.WAITING:
                if (Players.All.filter(p => !p.IsBot).length >= 1) {
                    setGameState(GameStates.INTRODUCTION);
                    setupBots();
                    assignRoles();
                }
                break;
                
            case GameStates.INTRODUCTION:
                setGameState(GameStates.GHOST_APPEARANCE);
                break;
                
            case GameStates.GHOST_APPEARANCE:
                setGameState(GameStates.CLUE_COLLECTION);
                break;
                
            case GameStates.CLUE_COLLECTION:
                // Если все квесты завершены, переходим к загадкам
                if (schoolMode.quests.currentQuest >= schoolMode.quests.allQuests.length) {
                    setGameState(GameStates.PUZZLE_SOLVING);
                }
                break;
                
            case GameStates.PUZZLE_SOLVING:
                setGameState(GameStates.FINAL_CONFRONTATION);
                break;
                
            case GameStates.FINAL_CONFRONTATION:
                setGameState(GameStates.EPILOGUE);
                break;
                
            case GameStates.EPILOGUE:
                Game.RestartGame();
                break;
        }
    });
    
    // Сохранение данных при выходе
    Players.OnPlayerDisconnected.Add(function(player) {
        if (player.IsBot) return;
        
        if (schoolMode.playerData[player.id]) {
            Props.Get(`Player_${player.id}_Scores`).Value = schoolMode.playerData[player.id].scores;
            Props.Get(`Player_${player.id}_Energy`).Value = schoolMode.playerData[player.id].energy;
            Props.Get(`Player_${player.id}_Hunger`).Value = schoolMode.playerData[player.id].hunger;
            Props.Get(`Player_${player.id}_Class`).Value = schoolMode.playerData[player.id].class || "";
            Props.Get(`Player_${player.id}_Role`).Value = schoolMode.roles[player.id] || Characters.STUDENT;
        }
    });
}

// Восстановление данных игрока при заходе
function restorePlayerData(player) {
    const scores = Props.Get(`Player_${player.id}_Scores`).Value;
    const energy = Props.Get(`Player_${player.id}_Energy`).Value;
    const hunger = Props.Get(`Player_${player.id}_Hunger`).Value;
    const playerClass = Props.Get(`Player_${player.id}_Class`).Value;
    const role = Props.Get(`Player_${player.id}_Role`).Value;
    
    schoolMode.playerData[player.id] = {
        scores: scores || 0,
        energy: energy || 100,
        hunger: hunger || 0,
        inventory: [],
        class: playerClass || null
    };
    
    schoolMode.roles[player.id] = role;
    
    if (playerClass) {
        if (playerClass === "5А") Class5A.Add(player);
        else if (playerClass === "6Б") Class6B.Add(player);
        else if (playerClass === "7В") Class7V.Add(player);
    }
    
    player.Properties.Get('Role').Value = role;
    player.Properties.Scores.Value = schoolMode.playerData[player.id].scores;
}

// Инициализация игры
function initGameMode() {
    Dmg.DamageOut.Value = false;
    Dmg.FriendlyFire.Value = false;
    BreackGraph.OnlyPlayerBlocksDmg = true;
    
    initServerProperties();
    initServerTimer();
    setupLeaderboard();
    setupSchoolZones();
    initChatCommands();
    setupEventHandlers();
    
    setGameState(GameStates.WAITING);
}

// Запуск игры
initGameMode();