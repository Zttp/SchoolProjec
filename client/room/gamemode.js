import { DisplayValueHeader, Color, Vector3 } from 'pixel_combats/basic';
import { Game, Players, Inventory, LeaderBoard, BuildBlocksSet, Teams, Damage, BreackGraph, Ui, Properties, GameMode, Spawns, Timers, TeamsBalancer, AreaService, AreaPlayerTriggerService, AreaViewService, Chat } from 'pixel_combats/room';
import { Bots } from 'pixel_combats/room';

// Настройки режима
const WAITING_TIME = 10;      // Ожидание игроков (утренний сбор)
const LINEUP_TIME = 30;       // Линейка
const LESSON_TIME = 180;      // Длительность урока
const BREAK_TIME = 180;       // Длительность перемены
const EXAM_TIME = 120;        // Длительность экзамена
const DAY_END_TIME = 30;      // Завершение учебного дня

// Цвета команд (классов)
const class5AColor = new Color(0, 0.5, 1, 0);    // Голубой - 5А
const class6BColor = new Color(1, 0.8, 0, 0);     // Оранжевый - 6Б
const class7VColor = new Color(0.5, 0, 1, 0);     // Фиолетовый - 7В

// Контексты
const Inv = Inventory.GetContext();
const Sp = Spawns.GetContext();
const Dmg = Damage.GetContext();
const Props = Properties.GetContext();

// Состояния игры (расписание)
const GameStates = {
    WAITING: "Утренний сбор",
    LINEUP: "Линейка",
    LESSON: "Урок",
    BREAK: "Перемена",
    EXAM: "Экзамен",
    END: "Конец дня"
};

// Основные таймеры
const mainTimer = Timers.GetContext().Get("Main");
const serverTimer = Timers.GetContext().Get("Server");
const scheduleTimer = Timers.GetContext().Get("Schedule");

// Глобальные переменные
const schoolMode = {
    state: GameStates.WAITING,
    roles: {},                  // {playerId: role}
    currentSubject: "Математика",
    currentQuestion: null,
    currentAnswer: null,
    lessonProgress: 0,
    schoolScore: 0,
    playerData: {},             // {playerId: {energy, hunger, scores, homework}}
    punishments: {},            // {playerId: punishmentTimer}
    examQuestions: [
        {q: "Сколько будет 2+2*2?", a: "6"},
        {q: "Столица Франции?", a: "Париж"},
        {q: "Химическая формула воды?", a: "H2O"},
        {q: "Год основания Санкт-Петербурга?", a: "1703"},
        {q: "Сколько планет в Солнечной системе?", a: "8"}
    ],
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
    subjectWeapons: {
        "Математика": "Калькулятор",
        "История": "Свиток",
        "Физика": "Молоток",
        "Химия": "Колба",
        "Физкультура": "Мяч"
    },
    adminId: "D411BD94CAE31F89"
    playerBots: {},              // {playerId: bot}
    botControllers: {},           // {botId: playerId} - кто управляет ботом// ID администратора
};

// Инициализация сервера
function initServerProperties() {
    Props.Get('Time_Hours').Value = 8;
    Props.Get('Time_Minutes').Value = 0;
    Props.Get('Time_Seconds').Value = 0;
    Props.Get('School_Score').Value = 0;
    Props.Get('Current_Subject').Value = "Ожидание";
    Props.Get('Game_State').Value = schoolMode.state;
    Props.Get('Current_Question').Value = "";
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

// Распределение ролей
function assignRoles() {
    const players = Players.All;
    
    // Директор (1 человек)
    if (players.length > 0) {
        const director = players[0];
        schoolMode.roles[director.id] = "Директор";
        director.Properties.Get('Role').Value = "Директор";
        director.contextedProperties.SkinType.Value = 4; // Особый скин
        initPlayerData(director);
    }
    
    // Учителя (10% игроков)
    const teacherCount = Math.max(1, Math.floor(players.length * 0.1));
    for (let i = 0; i < teacherCount; i++) {
        if (players.length > i+1) {
            const teacher = players[i+1];
            schoolMode.roles[teacher.id] = "Учитель";
            teacher.Properties.Get('Role').Value = "Учитель";
            teacher.contextedProperties.SkinType.Value = 3; // Скин учителя
            initPlayerData(teacher);
        }
    }
    
    // Остальные - ученики
    players.forEach(player => {
        if (!schoolMode.roles[player.id]) {
            schoolMode.roles[player.id] = "Ученик";
            player.Properties.Get('Role').Value = "Ученик";
            
            // Случайный скин ученика
            const skinType = Math.floor(Math.random() * 3);
            player.contextedProperties.SkinType.Value = skinType;
            
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
            homework: null,
            class: player.Team ? player.Team.Name : null
        };
    }
    
    // Восстановление данных при перезаходе
    player.Properties.Scores.Value = schoolMode.playerData[player.id].scores;
    player.Properties.Get('Role').Value = schoolMode.roles[player.id] || "Ученик";
    
    // Если игрок был в карцере
    if (schoolMode.punishments[player.id]) {
        punishPlayer(player, "продолжение наказания", schoolMode.punishments[player.id]);
    }
}

// Управление состоянием игры (расписанием)
function setGameState(newState) {
    schoolMode.state = newState;
    Props.Get('Game_State').Value = newState;
    
    switch(newState) {
        case GameStates.WAITING:
            Ui.GetContext().Hint.Value = "Утренний сбор! Зайдите в школу";
            Sp.Enable = true;
            mainTimer.Restart(WAITING_TIME);
            break;
            
        case GameStates.LINEUP:
            Ui.GetContext().Hint.Value = "Линейка! Постройтесь на площадке!";
            Inv.Main.Value = false;
            Inv.Secondary.Value = false;
            Inv.Melee.Value = false;
            Inv.Build.Value = false;
            Dmg.DamageOut.Value = false;
            Sp.Enable = true;
            Sp.Spawn();
            mainTimer.Restart(LINEUP_TIME);
            break;
            
        case GameStates.LESSON:
            const subject = getRandomSubject();
            schoolMode.currentSubject = subject;
            Props.Get('Current_Subject').Value = subject;
            
            Ui.GetContext().Hint.Value = `Урок ${subject}! Займите места в классе!`;
            Inv.Main.Value = false;
            Inv.Secondary.Value = false;
            Inv.Melee.Value = false;
            Inv.Build.Value = false;
            Dmg.DamageOut.Value = false;
            Sp.Enable = true;
            Sp.Spawn();
            
            schoolMode.lessonProgress = 0;
            mainTimer.Restart(LESSON_TIME);
            assignHomework();
            askQuestion();
            break;
            
        case GameStates.BREAK:
            Ui.GetContext().Hint.Value = "Перемена! Можно свободно перемещаться!";
            Inv.Main.Value = true;
            Inv.Secondary.Value = true;
            Inv.Melee.Value = true;
            Inv.Build.Value = false;
            Dmg.DamageOut.Value = true;
            Sp.Enable = true;
            Sp.Spawn();
            mainTimer.Restart(BREAK_TIME);
            break;
            
        case GameStates.EXAM:
            Ui.GetContext().Hint.Value = "Экзамен! Займите места в классе!";
            Inv.Main.Value = false;
            Inv.Secondary.Value = false;
            Inv.Melee.Value = false;
            Inv.Build.Value = false;
            Dmg.DamageOut.Value = false;
            Sp.Enable = true;
            Sp.Spawn();
            mainTimer.Restart(EXAM_TIME);
            askExamQuestion();
            break;
            
        case GameStates.END:
            Ui.GetContext().Hint.Value = "Учебный день окончен!";
            Sp.Enable = false;
            mainTimer.Restart(DAY_END_TIME);
            endSchoolDay();
            break;
    }
}

// Проверка находится ли игрок в зоне
function isPlayerInZone(player, zoneName) {
    const zone = schoolMode.schoolZones[zoneName];
    if (!zone) return false;
    
    const distance = player.Position.sub(zone.center).length;
    return distance <= zone.radius;
}

// Генерация случайного предмета
function getRandomSubject() {
    const subjects = ["Математика", "История", "Физика", "Химия", "Физкультура"];
    return subjects[Math.floor(Math.random() * subjects.length)];
}

// Выдача домашнего задания
function assignHomework() {
    Players.All.forEach(player => {
        if (schoolMode.roles[player.id] === "Ученик") {
            const assignments = [
                "Решить 5 задач по " + schoolMode.currentSubject,
                "Подготовить доклад",
                "Написать сочинение",
                "Выучить теорему",
                "Сделать проект"
            ];
            
            const assignment = assignments[Math.floor(Math.random() * assignments.length)];
            schoolMode.playerData[player.id].homework = assignment;
            player.Ui.Hint.Value = `📝 Домашнее задание: ${assignment}`;
        }
    });
}

// Система вопросов на уроке
function askQuestion() {
    const questions = {
        "Математика": [
            {q: "Сколько будет 15*3?", a: "45"},
            {q: "Чему равен корень из 144?", a: "12"},
            {q: "Число ПИ примерно равно?", a: "3.14"}
        ],
        "История": [
            {q: "В каком году началась Вторая мировая война?", a: "1939"},
            {q: "Кто первый полетел в космос?", a: "Гагарин"},
            {q: "Столица Древней Руси?", a: "Киев"}
        ],
        "Физика": [
            {q: "Формула силы тока?", a: "I=U/R"},
            {q: "Ускорение свободного падения?", a: "9.8"},
            {q: "Единица измерения силы?", a: "Ньютон"}
        ],
        "Химия": [
            {q: "Символ золота?", a: "Au"},
            {q: "Формула поваренной соли?", a: "NaCl"},
            {q: "Самый легкий газ?", a: "Водород"}
        ],
        "Физкультура": [
            {q: "Сколько таймов в футболе?", a: "2"},
            {q: "Высота баскетбольного кольца?", a: "3.05"},
            {q: "Длина марафона (км)?", a: "42.195"}
        ]
    };
    
    const subjectQuestions = questions[schoolMode.currentSubject];
    if (subjectQuestions && subjectQuestions.length > 0) {
        const randomQ = subjectQuestions[Math.floor(Math.random() * subjectQuestions.length)];
        schoolMode.currentQuestion = randomQ.q;
        schoolMode.currentAnswer = randomQ.a.toLowerCase();
        
        Props.Get('Current_Question').Value = schoolMode.currentQuestion;
        room.Ui.Hint.Value = `❓ Вопрос: ${schoolMode.currentQuestion}`;
    }
}

// Проверка ответа
function checkAnswer(player, answer) {
    if (!schoolMode.currentAnswer) return false;
    
    const normalizedAnswer = answer.trim().toLowerCase();
    if (normalizedAnswer === schoolMode.currentAnswer) {
        schoolMode.playerData[player.id].scores += 50;
        player.Properties.Scores.Value = schoolMode.playerData[player.id].scores;
        schoolMode.schoolScore += 10;
        Props.Get('School_Score').Value = schoolMode.schoolScore;
        player.Ui.Hint.Value = "✅ Правильно! +50 очков";
        return true;
    }
    
    player.Ui.Hint.Value = "❌ Неправильно! Попробуй еще";
    return false;
}

// Система экзамена
function askExamQuestion() {
    if (schoolMode.examQuestions.length > 0) {
        const randomQ = schoolMode.examQuestions[Math.floor(Math.random() * schoolMode.examQuestions.length)];
        schoolMode.currentQuestion = randomQ.q;
        schoolMode.currentAnswer = randomQ.a.toLowerCase();
        
        Props.Get('Current_Question').Value = schoolMode.currentQuestion;
        room.Ui.Hint.Value = `📝 Экзаменационный вопрос: ${schoolMode.currentQuestion}`;
    }
}

// Обработка конца учебного дня
function endSchoolDay() {
    // Награждение лучших учеников
    let bestStudent = null;
    let maxScore = 0;
    
    Players.All.forEach(player => {
        if (schoolMode.roles[player.id] === "Ученик" && schoolMode.playerData[player.id].scores > maxScore) {
            maxScore = schoolMode.playerData[player.id].scores;
            bestStudent = player;
        }
    });
    
    if (bestStudent) {
        schoolMode.playerData[bestStudent.id].scores += 500;
        bestStudent.Properties.Scores.Value = schoolMode.playerData[bestStudent.id].scores;
        room.Ui.Hint.Value = `🏆 Лучший ученик: ${bestStudent.NickName} +500 очков!`;
    }
    
    // Награждение лучшего учителя
    let bestTeacher = null;
    maxScore = 0;
    
    Players.All.forEach(player => {
        if (schoolMode.roles[player.id] === "Учитель" && schoolMode.playerData[player.id].scores > maxScore) {
            maxScore = schoolMode.playerData[player.id].scores;
            bestTeacher = player;
        }
    });
    
    if (bestTeacher) {
        schoolMode.playerData[bestTeacher.id].scores += 300;
        bestTeacher.Properties.Scores.Value = schoolMode.playerData[bestTeacher.id].scores;
        room.Ui.Hint.Value += `\n👩‍🏫 Лучший учитель: ${bestTeacher.NickName} +300 очков!`;
    }
    
    // Проверка победы школы
    if (schoolMode.schoolScore >= 5000) {
        room.Ui.Hint.Value += "\n🎉 Школа достигла отличных результатов! Все получают +200 очков!";
        Players.All.forEach(player => {
            schoolMode.playerData[player.id].scores += 200;
            player.Properties.Scores.Value = schoolMode.playerData[player.id].scores;
        });
    }
}

// Система характеристик игроков
function updatePlayerStats() {
    Players.All.forEach(player => {
        const playerData = schoolMode.playerData[player.id];
        if (!playerData) return;
        
        // Уменьшение энергии
        if (schoolMode.state === GameStates.BREAK) {
            playerData.energy = Math.max(0, playerData.energy - 0.2);
        }
        
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
                player.Ui.Hint.Value = "Наказание окончено! Возвращайтесь к занятиям";
            }
        }
    });
}

// Система наказаний
function punishPlayer(player, reason, duration = 60) {
    // Телепортация в карцер
    player.SetPositionAndRotation(
        schoolMode.schoolZones.detention.center,
        player.Rotation
    );
    
    // Установка таймера наказания
    schoolMode.punishments[player.id] = duration;
    
    player.Ui.Hint.Value = `⛔ Вы наказаны за ${reason}! Осталось: ${duration} сек`;
}

// Система нейросети-помощника
function askNeuralNetwork(question) {
    const responses = {
        "как решить": "Попробуй разбить задачу на части",
        "когда экзамен": "Экзамен в конце учебного дня",
        "где столовая": "Координаты: X0 Z30",
        "кто директор": "Директор самый уважаемый человек в школе",
        "что задали": "Проверь свой дневник (/homework)",
        "как получить оружие": "Оружие выдается только на переменах",
        "как не попасть в карцер": "Соблюдай школьные правила!",
        "где спортзал": "Координаты: X30 Z0",
        "где библиотека": "Координаты: X-30 Z0",
        "где актовый зал": "Координаты: X-30 Z30",
        "где площадка": "Координаты: X30 Z-30"
    };
    
    const lowerQuestion = question.toLowerCase();
    for (const [keyword, response] of Object.entries(responses)) {
        if (lowerQuestion.includes(keyword)) {
            return response;
        }
    }
    
    return "Я не понял вопроса. Попробуй спросить иначе";
}

// Зоны школы
function setupSchoolZones() {
    // Зона класса (для уроков)
    const classTrigger = AreaPlayerTriggerService.Get("classroom");
    classTrigger.Tags = ["classroom"];
    classTrigger.Enable = true;
    classTrigger.OnEnter.Add(function(player){
        const p = Players.Get(player.Id);
        if (!p) return;
        
        if (schoolMode.state === GameStates.LESSON || schoolMode.state === GameStates.EXAM) {
            p.Ui.Hint.Value = "Займи свое место!";
        }
    });
    
    // Зона спортзала (восстановление энергии)
    const gymTrigger = AreaPlayerTriggerService.Get("gym");
    gymTrigger.Tags = ["gym"];
    gymTrigger.Enable = true;
    gymTrigger.OnEnter.Add(function(player){
        const p = Players.Get(player.Id);
        if (!p) return;
        
        p.Ui.Hint.Value = "Используй /exercise для тренировки";
    });
    
    // Зона столовой (уменьшение голода)
    const cafeTrigger = AreaPlayerTriggerService.Get("cafeteria");
    cafeTrigger.Tags = ["cafeteria"];
    cafeTrigger.Enable = true;
    cafeTrigger.OnEnter.Add(function(player){
        const p = Players.Get(player.Id);
        if (!p) return;
        
        p.Ui.Hint.Value = "Используй /eat чтобы поесть";
    });
    
    // Зона библиотеки (выполнение домашнего задания)
    const libTrigger = AreaPlayerTriggerService.Get("library");
    libTrigger.Tags = ["library"];
    libTrigger.Enable = true;
    libTrigger.OnEnter.Add(function(player){
        const p = Players.Get(player.Id);
        if (!p) return;
        
        p.Ui.Hint.Value = "Используй /study для выполнения заданий";
    });
    
    // Зона школьного двора (уборка территории)
    const yardTrigger = AreaPlayerTriggerService.Get("yard");
    yardTrigger.Tags = ["yard"];
    yardTrigger.Enable = true;
    yardTrigger.OnEnter.Add(function(player){
        const p = Players.Get(player.Id);
        if (!p) return;
        
        p.Ui.Hint.Value = "Используй /clean для уборки территории";
    });
    
    // Зона актового зала (собрания)
    const auditoriumTrigger = AreaPlayerTriggerService.Get("auditorium");
    auditoriumTrigger.Tags = ["auditorium"];
    auditoriumTrigger.Enable = true;
    auditoriumTrigger.OnEnter.Add(function(player){
        const p = Players.Get(player.Id);
        if (!p) return;
        
        if (schoolMode.roles[p.id] === "Директор") {
            p.Ui.Hint.Value = "Используй /meeting для собрания";
        }
    });
    
    // Зона игровой площадки (активности)
    const playgroundTrigger = AreaPlayerTriggerService.Get("playground");
    playgroundTrigger.Tags = ["playground"];
    playgroundTrigger.Enable = true;
    playgroundTrigger.OnEnter.Add(function(player){
        const p = Players.Get(player.Id);
        if (!p) return;
        
        p.Ui.Hint.Value = "Используй /play для игр на площадке";
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
    
    const viewAuditorium = AreaViewService.GetContext().Get("auditorium");
    viewAuditorium.Color = new Color(1, 0, 1, 0.3);
    viewAuditorium.Tags = ["auditorium"];
    viewAuditorium.Enable = true;
    
    const viewPlayground = AreaViewService.GetContext().Get("playground");
    viewPlayground.Color = new Color(0, 1, 1, 0.3);
    viewPlayground.Tags = ["playground"];
    viewPlayground.Enable = true;
    
    const viewDetention = AreaViewService.GetContext().Get("detention");
    viewDetention.Color = new Color(0.3, 0.3, 0.3, 0.5);
    viewDetention.Tags = ["detention"];
    viewDetention.Enable = true;
}

// Спавн бота для игрока
function spawnPlayerBot(player, skinId, weaponId) {
    // Если у игрока уже есть бот - удаляем
    if (schoolMode.playerBots[player.id]) {
        schoolMode.playerBots[player.id].Destroy();
        delete schoolMode.playerBots[player.id];
    }

    const spawnData = {
        Position: player.Position,
        LookDirection: player.LookDirection,
        WeaponId: weaponId,
        SkinId: skinId
    };

    const bot = Bots.CreateHuman(spawnData);
    if (bot) {
        schoolMode.playerBots[player.id] = bot;
        return bot;
    }
    return null;
}

// Присоединение управления ботом к игроку
function attachBotToPlayer(player) {
    const bot = schoolMode.playerBots[player.id];
    if (!bot) {
        player.Ui.Hint.Value = "У вас нет бота! Создайте бота командой /bot";
        return;
    }

    schoolMode.botControllers[bot.Id] = player.id;
    player.Ui.Hint.Value = "Вы управляете ботом!";
    
    // Синхронизация начального состояния
    bot.SetPositionAndDirection(
        player.Position,
        player.LookDirection
    );
}

// Отсоединение управления
function detachBotFromPlayer(player) {
    const bot = schoolMode.playerBots[player.id];
    if (!bot) return;
    
    delete schoolMode.botControllers[bot.Id];
    player.Ui.Hint.Value = "Вы больше не управляете ботом.";
}

// Команды чата
function initChatCommands() {
    Chat.OnMessage.Add(function(m) {
        const msg = m.Text.trim();
        const sender = Players.GetByRoomId(m.Sender);
        if (!sender) return;

        const args = msg.split(' ');
        const command = args[0].toLowerCase();

        if (command === '/help') {
            let helpText = `📚 Школьные команды:
/answer [ответ] - ответить на вопрос
/ask [вопрос] - спросить нейросеть
/where - где я должен быть?
/scores - мои очки
/energy - моя энергия
/hunger - мой голод
/homework - показать домашнее задание
/schedule - показать расписание`;

            if (schoolMode.roles[sender.id] === "Ученик") {
                helpText += `
/exercise - тренировка (в спортзале)
/study - учеба (в библиотеке)
/clean - уборка (во дворе)
/eat - поесть (в столовой)
/complete - сдать задание (в библиотеке)
/play - играть на площадке`;
            }

            if (schoolMode.roles[sender.id] === "Учитель") {
                helpText += `
/report [id] - пожаловаться на нарушителя
/grade [id] [оценка] - поставить оценку`;
            }

            if (schoolMode.roles[sender.id] === "Директор") {
                helpText += `
/detention [id] - отправить в карцер
/meeting - провести собрание
/announce [текст] - объявить всем
/endlesson - завершить урок досрочно`;
            }

            sender.Ui.Hint.Value = helpText;
        }
        
        else if (command === '/answer') {
            if (args.length < 2) {
                sender.Ui.Hint.Value = "Использование: /answer [ваш ответ]";
                return;
            }
            
            const answer = args.slice(1).join(' ');
            if (schoolMode.state === GameStates.LESSON || schoolMode.state === GameStates.EXAM) {
                checkAnswer(sender, answer);
            } else {
                sender.Ui.Hint.Value = "Сейчас не время отвечать на вопросы!";
            }
        }
        
        else if (command === '/ask') {
            if (args.length < 2) {
                sender.Ui.Hint.Value = "Использование: /ask [ваш вопрос]";
                return;
            }
            
            const question = args.slice(1).join(' ');
            const response = askNeuralNetwork(question);
            sender.Ui.Hint.Value = `🧠 Нейросеть: ${response}`;
        }
        
        else if (command === '/where') {
            switch(schoolMode.state) {
                case GameStates.LINEUP:
                    sender.Ui.Hint.Value = "Вы должны быть на школьной площадке!";
                    break;
                case GameStates.LESSON:
                    sender.Ui.Hint.Value = `Вы должны быть в классе на уроке ${schoolMode.currentSubject}!`;
                    break;
                case GameStates.EXAM:
                    sender.Ui.Hint.Value = "Вы должны быть в классе на экзамене!";
                    break;
                case GameStates.BREAK:
                    sender.Ui.Hint.Value = "У вас перемена! Можете свободно перемещаться!";
                    break;
                default:
                    sender.Ui.Hint.Value = "Следуйте общим указаниям!";
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
        
        else if (command === '/exercise') {
            if (!isPlayerInZone(sender, "gym")) {
                sender.Ui.Hint.Value = "Вы должны быть в спортзале!";
                return;
            }
            
            const playerData = schoolMode.playerData[sender.id];
            if (!playerData) return;
            
            if (playerData.energy >= 100) {
                sender.Ui.Hint.Value = "У вас полная энергия!";
                return;
            }
            
            playerData.energy = Math.min(100, playerData.energy + 30);
            playerData.scores += 10;
            sender.Properties.Scores.Value = playerData.scores;
            sender.Ui.Hint.Value = "💪 Вы потренировались! +30 энергии, +10 очков";
        }
        
        else if (command === '/study') {
            if (!isPlayerInZone(sender, "library")) {
                sender.Ui.Hint.Value = "Вы должны быть в библиотеке!";
                return;
            }
            
            const playerData = schoolMode.playerData[sender.id];
            if (!playerData) return;
            
            playerData.scores += 20;
            sender.Properties.Scores.Value = playerData.scores;
            schoolMode.schoolScore += 5;
            Props.Get('School_Score').Value = schoolMode.schoolScore;
            sender.Ui.Hint.Value = "📚 Вы позанимались! +20 очков";
        }
        
        else if (command === '/clean') {
            if (!isPlayerInZone(sender, "yard")) {
                sender.Ui.Hint.Value = "Вы должны быть на школьном дворе!";
                return;
            }
            
            const playerData = schoolMode.playerData[sender.id];
            if (!playerData) return;
            
            playerData.scores += 15;
            sender.Properties.Scores.Value = playerData.scores;
            schoolMode.schoolScore += 3;
            Props.Get('School_Score').Value = schoolMode.schoolScore;
            sender.Ui.Hint.Value = "🧹 Вы убрали территорию! +15 очков";
        }
        
        else if (command === '/eat') {
            if (!isPlayerInZone(sender, "cafeteria")) {
                sender.Ui.Hint.Value = "Вы должны быть в столовой!";
                return;
            }
            
            const playerData = schoolMode.playerData[sender.id];
            if (!playerData) return;
            
            if (playerData.hunger <= 0) {
                sender.Ui.Hint.Value = "Вы не голодны!";
                return;
            }
            
            playerData.hunger = Math.max(0, playerData.hunger - 40);
            playerData.scores += 5;
            sender.Properties.Scores.Value = playerData.scores;
            sender.Ui.Hint.Value = "🍎 Вы поели! -40 голода, +5 очков";
        }
        
        else if (command === '/homework') {
            const playerData = schoolMode.playerData[sender.id];
            if (!playerData) return;
            
            if (playerData.homework) {
                sender.Ui.Hint.Value = `📝 Ваше домашнее задание: ${playerData.homework}`;
            } else {
                sender.Ui.Hint.Value = "У вас нет домашнего задания!";
            }
        }
        
        else if (command === '/complete') {
            if (!isPlayerInZone(sender, "library")) {
                sender.Ui.Hint.Value = "Вы должны быть в библиотеке!";
                return;
            }
            
            const playerData = schoolMode.playerData[sender.id];
            if (!playerData) return;
            
            if (playerData.homework) {
                playerData.scores += 100;
                sender.Properties.Scores.Value = playerData.scores;
                schoolMode.schoolScore += 25;
                Props.Get('School_Score').Value = schoolMode.schoolScore;
                playerData.homework = null;
                sender.Ui.Hint.Value = "✅ Домашнее задание сдано! +100 очков";
            } else {
                sender.Ui.Hint.Value = "У вас нет домашнего задания!";
            }
        }
        
        else if (command === '/play') {
            if (!isPlayerInZone(sender, "playground")) {
                sender.Ui.Hint.Value = "Вы должны быть на игровой площадке!";
                return;
            }
            
            const playerData = schoolMode.playerData[sender.id];
            if (!playerData) return;
            
            playerData.scores += 10;
            playerData.energy = Math.max(0, playerData.energy - 10);
            sender.Properties.Scores.Value = playerData.scores;
            sender.Ui.Hint.Value = "⚽ Вы поиграли на площадке! +10 очков, -10 энергии";
        }
        
        else if (command === '/report') {
            if (schoolMode.roles[sender.id] !== "Учитель") {
                sender.Ui.Hint.Value = "❌ Только учителя могут жаловаться!";
                return;
            }
            
            if (args.length < 2) {
                sender.Ui.Hint.Value = "Использование: /report [id игрока]";
                return;
            }
            
            const target = Players.GetByRoomId(Number(args[1]));
            if (!target) {
                sender.Ui.Hint.Value = "Игрок не найден!";
                return;
            }
            
            target.Ui.Hint.Value = "⚠️ На вас пожаловался учитель!";
            sender.Ui.Hint.Value = `Жалоба на ${target.NickName} отправлена директору!`;
        }
        
        else if (command === '/grade') {
            if (schoolMode.roles[sender.id] !== "Учитель") {
                sender.Ui.Hint.Value = "❌ Только учителя могут ставить оценки!";
                return;
            }
            
            if (args.length < 3) {
                sender.Ui.Hint.Value = "Использование: /grade [id] [оценка (2-5)]";
                return;
            }
            
            const target = Players.GetByRoomId(Number(args[1]));
            const grade = parseInt(args[2]);
            
            if (!target) {
                sender.Ui.Hint.Value = "Игрок не найден!";
                return;
            }
            
            if (isNaN(grade) || grade < 2 || grade > 5) {
                sender.Ui.Hint.Value = "Некорректная оценка! Используйте от 2 до 5";
                return;
            }
            
            const targetData = schoolMode.playerData[target.id];
            if (!targetData) return;
            
            const points = grade * 20;
            targetData.scores += points;
            target.Properties.Scores.Value = targetData.scores;
            
            target.Ui.Hint.Value = `📝 Учитель поставил вам ${grade}! +${points} очков`;
            sender.Ui.Hint.Value = `✅ Вы поставили ${grade} игроку ${target.NickName}`;
        }
        
        else if (command === '/detention') {
            if (schoolMode.roles[sender.id] !== "Директор") {
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
        
        else if (command === '/meeting') {
            if (schoolMode.roles[sender.id] !== "Директор") {
                sender.Ui.Hint.Value = "❌ Только директор может проводить собрания!";
                return;
            }
            
            if (!isPlayerInZone(sender, "auditorium")) {
                sender.Ui.Hint.Value = "Вы должны быть в актовом зале!";
                return;
            }
            
            let participants = 0;
            Players.All.forEach(player => {
                if (isPlayerInZone(player, "auditorium")) {
                    const playerData = schoolMode.playerData[player.id];
                    if (playerData) {
                        playerData.scores += 30;
                        player.Properties.Scores.Value = playerData.scores;
                        participants++;
                    }
                }
            });
            
            room.Ui.Hint.Value = `📢 Директор проводит собрание! Все присутствующие получают +30 очков`;
            sender.Ui.Hint.Value = `✅ Собрание проведено! Участников: ${participants}`;
        }
        
        else if (command === '/announce') {
            if (schoolMode.roles[sender.id] !== "Директор") {
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
        
        else if (command === '/endlesson') {
            if (schoolMode.roles[sender.id] !== "Директор") {
                sender.Ui.Hint.Value = "❌ Только директор может завершать уроки!";
                return;
            }
            
            if (schoolMode.state !== GameStates.LESSON) {
                sender.Ui.Hint.Value = "Сейчас не идет урок!";
                return;
            }
            
            mainTimer.Stop();
            setGameState(GameStates.BREAK);
            sender.Ui.Hint.Value = "Урок завершен досрочно!";
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

// Настройка лидерборда
function setupLeaderboard() {
    LeaderBoard.PlayerLeaderBoardValues = [
        new DisplayValueHeader('Role', 'Роль', 'Роль'),
        new DisplayValueHeader('Scores', 'Очки', 'Очки'),
        new DisplayValueHeader('Energy', 'Энергия', 'Энергия'),
        new DisplayValueHeader('Hunger', 'Голод', 'Голод')
    ];

    LeaderBoard.PlayersWeightGetter.Set(function(p) {
        return p.Properties.Get('Scores').Value;
    });
}

// Обработчики событий
function setupEventHandlers() {
    // Таймер для синхронизации ботов
    const botSyncTimer = Timers.GetContext().Get("BotSync");
    botSyncTimer.OnTimer.Add(function() {
        for (const [botId, playerId] of Object.entries(schoolMode.botControllers)) {
            const player = Players.GetByRoomId(playerId);
            const bot = Bots.Get(parseInt(botId));
        
            if (player && bot && bot.Alive) {
            // Синхронизация позиции и взгляда
                bot.SetPositionAndDirection(
                    player.Position,
                    player.LookDirection
                );
            
            // Синхронизация атаки
                bot.Attack = player.Inventory.Main.Attack;
            }
        }
        botSyncTimer.RestartLoop(0.1); // 100 мс
    });
    botSyncTimer.RestartLoop(0.1);
    // Обновление характеристик
    const statTimer = Timers.GetContext().Get("Stats");
    statTimer.OnTimer.Add(function() {
        updatePlayerStats();
        statTimer.RestartLoop(5);
    });
    statTimer.RestartLoop(5);
    
    Players.OnPlayerConnected.Add(function(player) {
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
        if (Players.All.length >= 3 && schoolMode.state === GameStates.WAITING) {
            setGameState(GameStates.LINEUP);
            assignRoles();
        }
    });
    
    Damage.OnKill.Add(function(killer, victim) {
        // Разрешаем драки только на переменах
        if (schoolMode.state !== GameStates.BREAK) {
            if (killer) {
                punishPlayer(killer, "насилие вне перемены");
            }
            return;
        }
        
        if (killer && victim) {
            const killerData = schoolMode.playerData[killer.id];
            const victimData = schoolMode.playerData[victim.id];
            
            if (killerData) {
                killerData.scores += 25;
                killer.Properties.Scores.Value = killerData.scores;
            }
            
            if (victimData) {
                victimData.scores -= 10;
                victim.Properties.Scores.Value = victimData.scores;
            }
        }
    });
    
    Damage.OnDeath.Add(function(player, info) {
        // Не наказываем за смерть от падения
        if (info.DamageType !== "Fall") {
            const playerData = schoolMode.playerData[player.id];
            if (playerData) {
                playerData.scores -= 15;
                player.Properties.Scores.Value = playerData.scores;
            }
        }
        
        // Возрождаем игрока
        if (GameMode.Parameters.GetBool('AutoSpawn')) {
            player.Spawns.Spawn();
        }
    });

    // Обработчик смерти ботов
Bots.OnBotDeath.Add(function(deathData) {
    const botId = deathData.Bot.Id;
    if (schoolMode.botControllers[botId]) {
        const playerId = schoolMode.botControllers[botId];
        const player = Players.GetByRoomId(playerId);
        if (player) {
            player.Ui.Hint.Value = "Ваш бот уничтожен!";
        }
        delete schoolMode.botControllers[botId];
    }
});

// Обработчик удаления ботов
Bots.OnBotRemove.Add(function(bot) {
    const botId = bot.Id;
    if (schoolMode.botControllers[botId]) {
        delete schoolMode.botControllers[botId];
    }
    
    // Удаляем из playerBots если принадлежал игроку
    for (const [playerId, playerBot] of Object.entries(schoolMode.playerBots)) {
        if (playerBot.Id === botId) {
            delete schoolMode.playerBots[playerId];
            break;
        }
    }
});
    
    // Обработчик основного таймера (расписания)
    mainTimer.OnTimer.Add(function() {
        switch(schoolMode.state) {
            case GameStates.WAITING:
                if (Players.All.length >= 1) {
                    setGameState(GameStates.LINEUP);
                    assignRoles();
                }
                break;
                
            case GameStates.LINEUP:
                setGameState(GameStates.LESSON);
                break;
                
            case GameStates.LESSON:
                setGameState(GameStates.BREAK);
                break;
                
            case GameStates.BREAK:
                setGameState(GameStates.EXAM);
                break;
                
            case GameStates.EXAM:
                setGameState(GameStates.END);
                break;
                
            case GameStates.END:
                Game.RestartGame();
                break;
        }
    });
    
    // Обработчик для сохранения данных при выходе
    Players.OnPlayerDisconnected.Add(function(player) {
        // Сохраняем данные игрока в свойства комнаты
        if (schoolMode.playerData[player.id]) {
            Props.Get(`Player_${player.id}_Scores`).Value = schoolMode.playerData[player.id].scores;
            Props.Get(`Player_${player.id}_Energy`).Value = schoolMode.playerData[player.id].energy;
            Props.Get(`Player_${player.id}_Hunger`).Value = schoolMode.playerData[player.id].hunger;
            Props.Get(`Player_${player.id}_Homework`).Value = schoolMode.playerData[player.id].homework || "";
            Props.Get(`Player_${player.id}_Class`).Value = schoolMode.playerData[player.id].class || "";
            Props.Get(`Player_${player.id}_Role`).Value = schoolMode.roles[player.id] || "Ученик";
        }
    });
}

// Восстановление данных игрока при заходе
function restorePlayerData(player) {
    const scores = Props.Get(`Player_${player.id}_Scores`).Value;
    const energy = Props.Get(`Player_${player.id}_Energy`).Value;
    const hunger = Props.Get(`Player_${player.id}_Hunger`).Value;
    const homework = Props.Get(`Player_${player.id}_Homework`).Value;
    const playerClass = Props.Get(`Player_${player.id}_Class`).Value;
    const role = Props.Get(`Player_${player.id}_Role`).Value;
    
    schoolMode.playerData[player.id] = {
        scores: scores || 0,
        energy: energy || 100,
        hunger: hunger || 0,
        homework: homework || null,
        class: playerClass || null
    };
    
    schoolMode.roles[player.id] = role;
    
    // Вступление в класс
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
