import { DisplayValueHeader, Color, Vector3 } from 'pixel_combats/basic';
import { Game, Players, Inventory, LeaderBoard, BuildBlocksSet, Teams, Damage, BreackGraph, Ui, Properties, GameMode, Spawns, Timers, TeamsBalancer, AreaService, AreaPlayerTriggerService, AreaViewService, Chat } from 'pixel_combats/room';

// Настройки режима
const WAITING_TIME = 10;      // Ожидание игроков (утренний сбор)
const LESSON_TIME = 120;      // Длительность урока
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
    playerEnergy: {},           // {playerId: energy}
    playerHunger: {},           // {playerId: hunger}
    homeworkAssignments: {},    // {playerId: assignment}
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
        detention: {center: new Vector3(0, -10, 0), radius: 5}
    },
    subjectWeapons: {
        "Математика": "Калькулятор",
        "История": "Свиток",
        "Физика": "Молоток",
        "Химия": "Колба",
        "Физкультура": "Мяч"
    }
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
    }
    
    // Учителя (10% игроков)
    const teacherCount = Math.max(1, Math.floor(players.length * 0.1));
    for (let i = 0; i < teacherCount; i++) {
        if (players.length > i+1) {
            const teacher = players[i+1];
            schoolMode.roles[teacher.id] = "Учитель";
            teacher.Properties.Get('Role').Value = "Учитель";
            teacher.contextedProperties.SkinType.Value = 3; // Скин учителя
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
        }
        
        // Инициализация характеристик
        schoolMode.playerEnergy[player.id] = 100;
        schoolMode.playerHunger[player.id] = 0;
    });
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
            Inv.Explosive.Value = false;
            Inv.Build.Value = false;
            Dmg.DamageOut.Value = false;
            Sp.Enable = true;
            Sp.Spawn();
            mainTimer.Restart(60);
            break;
            
        case GameStates.LESSON:
            const subject = getRandomSubject();
            schoolMode.currentSubject = subject;
            Props.Get('Current_Subject').Value = subject;
            
            Ui.GetContext().Hint.Value = `Урок ${subject}! Займите места в классе!`;
            Inv.Main.Value = false;
            Inv.Secondary.Value = false;
            Inv.Melee.Value = false;
            Inv.Explosive.Value = false;
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
            Inv.Explosive.Value = true;
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
            Inv.Explosive.Value = false;
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
            schoolMode.homeworkAssignments[player.id] = assignment;
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
        player.Properties.Scores.Value += 50;
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
        if (schoolMode.roles[player.id] === "Ученик" && player.Properties.Scores.Value > maxScore) {
            maxScore = player.Properties.Scores.Value;
            bestStudent = player;
        }
    });
    
    if (bestStudent) {
        bestStudent.Properties.Scores.Value += 500;
        room.Ui.Hint.Value = `🏆 Лучший ученик: ${bestStudent.NickName} +500 очков!`;
    }
    
    // Награждение лучшего учителя
    let bestTeacher = null;
    maxScore = 0;
    
    Players.All.forEach(player => {
        if (schoolMode.roles[player.id] === "Учитель" && player.Properties.Scores.Value > maxScore) {
            maxScore = player.Properties.Scores.Value;
            bestTeacher = player;
        }
    });
    
    if (bestTeacher) {
        bestTeacher.Properties.Scores.Value += 300;
        room.Ui.Hint.Value += `\n👩‍🏫 Лучший учитель: ${bestTeacher.NickName} +300 очков!`;
    }
    
    // Проверка победы школы
    if (schoolMode.schoolScore >= 5000) {
        room.Ui.Hint.Value += "\n🎉 Школа достигла отличных результатов! Все получают +200 очков!";
        Players.All.forEach(player => {
            player.Properties.Scores.Value += 200;
        });
    }
}

// Система характеристик игроков
function updatePlayerStats() {
    Players.All.forEach(player => {
        // Уменьшение энергии
        if (schoolMode.state === GameStates.BREAK) {
            schoolMode.playerEnergy[player.id] = Math.max(0, schoolMode.playerEnergy[player.id] - 0.2);
        }
        
        // Увеличение голода
        schoolMode.playerHunger[player.id] = Math.min(100, schoolMode.playerHunger[player.id] + 0.1);
        
        // Обновление UI
        player.Ui.Energy.Value = `⚡ ${Math.round(schoolMode.playerEnergy[player.id])}%`;
        player.Ui.Hunger.Value = `🍎 ${Math.round(schoolMode.playerHunger[player.id])}%`;
        
        // Эффекты при низких характеристиках
        if (schoolMode.playerEnergy[player.id] < 20) {
            player.Ui.Hint.Value += "\n⚠️ Вы устали! Сходите в спортзал!";
        }
        
        if (schoolMode.playerHunger[player.id] > 80) {
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
        "как не попасть в карцер": "Соблюдай школьные правила!"
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
            sender.Ui.Hint.Value = `📚 Школьные команды:
/answer [ответ] - ответить на вопрос
/ask [вопрос] - спросить нейросеть
/where - где я должен быть?
/scores - мои очки
/energy - моя энергия
/hunger - мой голод
/exercise - тренировка (в спортзале)
/study - учеба (в библиотеке)
/clean - уборка (во дворе)
/eat - поесть (в столовой)
/homework - показать домашнее задание
/complete - сдать задание (в библиотеке)
/report [id] - пожаловаться на нарушителя (учитель)
/detention [id] - отправить в карцер (директор)
/schedule - показать расписание`;
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
            sender.Ui.Hint.Value = `🏆 Ваши очки: ${sender.Properties.Scores.Value}`;
        }
        
        else if (command === '/energy') {
            sender.Ui.Hint.Value = `⚡ Ваша энергия: ${Math.round(schoolMode.playerEnergy[sender.id])}%`;
        }
        
        else if (command === '/hunger') {
            sender.Ui.Hint.Value = `🍎 Ваш голод: ${Math.round(schoolMode.playerHunger[sender.id])}%`;
        }
        
        else if (command === '/exercise') {
            if (!sender.IsInArea("gym")) {
                sender.Ui.Hint.Value = "Вы должны быть в спортзале!";
                return;
            }
            
            if (schoolMode.playerEnergy[sender.id] >= 100) {
                sender.Ui.Hint.Value = "У вас полная энергия!";
                return;
            }
            
            schoolMode.playerEnergy[sender.id] = Math.min(100, schoolMode.playerEnergy[sender.id] + 30);
            sender.Properties.Scores.Value += 10;
            sender.Ui.Hint.Value = "💪 Вы потренировались! +30 энергии, +10 очков";
        }
        
        else if (command === '/study') {
            if (!sender.IsInArea("library")) {
                sender.Ui.Hint.Value = "Вы должны быть в библиотеке!";
                return;
            }
            
            sender.Properties.Scores.Value += 20;
            schoolMode.schoolScore += 5;
            Props.Get('School_Score').Value = schoolMode.schoolScore;
            sender.Ui.Hint.Value = "📚 Вы позанимались! +20 очков";
        }
        
        else if (command === '/clean') {
            if (!sender.IsInArea("yard")) {
                sender.Ui.Hint.Value = "Вы должны быть на школьном дворе!";
                return;
            }
            
            sender.Properties.Scores.Value += 15;
            schoolMode.schoolScore += 3;
            Props.Get('School_Score').Value = schoolMode.schoolScore;
            sender.Ui.Hint.Value = "🧹 Вы убрали территорию! +15 очков";
        }
        
        else if (command === '/eat') {
            if (!sender.IsInArea("cafeteria")) {
                sender.Ui.Hint.Value = "Вы должны быть в столовой!";
                return;
            }
            
            if (schoolMode.playerHunger[sender.id] <= 0) {
                sender.Ui.Hint.Value = "Вы не голодны!";
                return;
            }
            
            schoolMode.playerHunger[sender.id] = Math.max(0, schoolMode.playerHunger[sender.id] - 40);
            sender.Properties.Scores.Value += 5;
            sender.Ui.Hint.Value = "🍎 Вы поели! -40 голода, +5 очков";
        }
        
        else if (command === '/homework') {
            const assignment = schoolMode.homeworkAssignments[sender.id];
            if (assignment) {
                sender.Ui.Hint.Value = `📝 Ваше домашнее задание: ${assignment}`;
            } else {
                sender.Ui.Hint.Value = "У вас нет домашнего задания!";
            }
        }
        
        else if (command === '/complete') {
            if (!sender.IsInArea("library")) {
                sender.Ui.Hint.Value = "Вы должны быть в библиотеке!";
                return;
            }
            
            if (schoolMode.homeworkAssignments[sender.id]) {
                sender.Properties.Scores.Value += 100;
                schoolMode.schoolScore += 25;
                Props.Get('School_Score').Value = schoolMode.schoolScore;
                delete schoolMode.homeworkAssignments[sender.id];
                sender.Ui.Hint.Value = "✅ Домашнее задание сдано! +100 очков";
            } else {
                sender.Ui.Hint.Value = "У вас нет домашнего задания!";
            }
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
        
        else if (command === '/schedule') {
            sender.Ui.Hint.Value = `📅 Расписание:
1. Утренний сбор
2. Линейка
3. Урок ${schoolMode.currentSubject}
4. Перемена
5. Экзамен
6. Конец дня`;
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
    // Обновление характеристик
    const statTimer = Timers.GetContext().Get("Stats");
    statTimer.OnTimer.Add(function() {
        updatePlayerStats();
        statTimer.RestartLoop(5);
    });
    statTimer.RestartLoop(5);
    
    Players.OnPlayerConnected.Add(function(player) {
        player.Properties.Get('Scores').Value = 0;
        player.Properties.Get('Role').Value = "Новичок";
        player.Ui.Hint.Value = 'Добро пожаловать в школу! Напишите /help';
        
        if (Players.All.length >= 1 && schoolMode.state === GameStates.WAITING) {
            setGameState(GameStates.LINEUP);
            assignRoles();
        }
    });
    
    Damage.OnKill.Add(function(killer, victim) {
        if (schoolMode.state !== GameStates.BREAK) {
            punishPlayer(killer, "насилие вне перемены");
            return;
        }
        
        if (killer && victim) {
            killer.Properties.Scores.Value += 25;
            victim.Properties.Scores.Value -= 10;
        }
    });
    
    Damage.OnDeath.Add(function(player) {
        player.Properties.Scores.Value -= 15;
        player.Spawns.Spawn();
    });
    
    // Обработчик основного таймера (расписания)
    mainTimer.OnTimer.Add(function() {
        switch(schoolMode.state) {
            case GameStates.WAITING:
                setGameState(GameStates.LINEUP);
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
