import { DisplayValueHeader, Color, Vector3, BuildBlocksSet } from 'pixel_combats/basic';
import { Game, Players, Inventory, LeaderBoard, Teams, Damage, Ui, Properties, Spawns, Timers, AreaService, AreaPlayerTriggerService, AreaViewService, Chat } from 'pixel_combats/room';

// ========== КОНСТАНТЫ И НАСТРОЙКИ ==========
const LESSON_TIME = 180;      // Длительность урока (сек)
const BREAK_TIME = 120;       // Длительность перемены (сек)
const DETENTION_TIME = 30;    // Время в карцере (сек)
const MAX_SCORE = 5000;       // Очки для победы
const EXAM_QUESTION_TIME = 20;// Время на ответ на экзамене (сек)

// Цвета зон
const CLASS_COLOR = new Color(0.2, 0.6, 1, 0.3);       // Голубой
const GYM_COLOR = new Color(1, 0.3, 0.3, 0.3);         // Красный
const CAFETERIA_COLOR = new Color(1, 0.8, 0.2, 0.3);   // Оранжевый
const DETENTION_COLOR = new Color(0.1, 0.1, 0.1, 0.5); // Темный
const LIBRARY_COLOR = new Color(0.5, 0.3, 0.1, 0.3);   // Коричневый
const YARD_COLOR = new Color(0.2, 0.8, 0.2, 0.3);      // Зеленый

// Состояния игры
const SchoolStates = {
    MORNING: "Morning",
    LESSON: "Lesson",
    BREAK: "Break",
    MEETING: "Meeting",
    EXAM: "Exam",
    END: "End"
};

// ========== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==========
const schoolMode = {
    state: SchoolStates.MORNING,
    currentLesson: "math",
    director: null,
    teachers: [],
    scheduleTimer: null,
    lessonEndTime: 0,
    examQuestions: [],
    activeQuestion: null,
    playerItems: new Map(),
    playerTasks: new Map(),
    detentionPlayers: new Set(),
    playerScores: new Map(),
    playerHealth: new Map(),
    playerHunger: new Map(),
    playerEnergy: new Map(),
    neuroResponses: [
        "Интересный вопрос! В школе это изучают в 9 классе.",
        "Хм... Давайте подумаем вместе. Возможно, ответ кроется в учебнике.",
        "Это сложный материал, но вы справитесь!",
        "Правильный ответ можно найти на странице 45 учебника.",
        "Мне кажется, вы уже знаете ответ на этот вопрос.",
        "Вероятно, стоит спросить у учителя на уроке.",
        "Это фундаментальное знание, которое пригодится в будущем.",
        "Не переживайте, даже великие ученые ошибались!",
        "Ответ требует глубоких размышлений. Попробуйте еще раз.",
        "Отличный вопрос! Обязательно обсудим его на уроке."
    ],
    examInProgress: false,
    examTimer: null,
    cleaningAreas: new Set(),
    activeHomework: null
};

// Контексты
const Props = Properties.GetContext();
const Sp = Spawns.GetContext();
const ChatCtx = Chat.GetContext();

// ========== ОСНОВНЫЕ ФУНКЦИИ ==========

// Инициализация сервера
function initServerProperties() {
    Props.Get('Game_State').Value = schoolMode.state;
    Props.Get('Current_Lesson').Value = schoolMode.currentLesson;
    Props.Get('Time_Left').Value = 0;
    Props.Get('Director').Value = "Не назначен";
    Props.Get('Total_Score').Value = 0;
    Props.Get('Homework_Progress').Value = 0;
    Props.Get('Cleaning_Progress').Value = 0;
}

// Создание команд с учетом нового API
function setupTeams() {
    // Удаляем все существующие команды
    Teams.All.forEach(team => {
        Teams.Remove(team.Id);
    });

    // Создаем новые команды
    Teams.Add('ClassA', '9 "А"', CLASS_COLOR);
    Teams.Add('ClassB', '9 "Б"', CLASS_COLOR);
    Teams.Add('ClassC', '9 "В"', CLASS_COLOR);

    const ClassA = Teams.Get('ClassA');
    const ClassB = Teams.Get('ClassB');
    const ClassC = Teams.Get('ClassC');

    // Настройки строительства
    ClassA.Build.BlocksSet.Value = BuildBlocksSet.Blue;
    ClassB.Build.BlocksSet.Value = BuildBlocksSet.Red;
    ClassC.Build.BlocksSet.Value = BuildBlocksSet.Green;

    // Настройки спавнов
    ClassA.Spawns.SpawnPointsGroups.Add(1);
    ClassB.Spawns.SpawnPointsGroups.Add(2);
    ClassC.Spawns.SpawnPointsGroups.Add(3);

    return { ClassA, ClassB, ClassC };
}

const { ClassA, ClassB, ClassC } = setupTeams();

// Создание зон школы
function setupSchoolZones() {
    // Зоны классов
    createSchoolZone("class_math", CLASS_COLOR, "Урок математики", "class");
    createSchoolZone("class_biology", CLASS_COLOR, "Урок биологии", "class");
    createSchoolZone("class_history", CLASS_COLOR, "Урок истории", "class");
    
    // Зоны школы
    createSchoolZone("gym", GYM_COLOR, "Спортзал", "gym");
    createSchoolZone("cafeteria", CAFETERIA_COLOR, "Столовая", "cafeteria");
    createSchoolZone("detention", DETENTION_COLOR, "Карцер", "detention");
    createSchoolZone("library", LIBRARY_COLOR, "Библиотека", "library");
    createSchoolZone("schoolyard", YARD_COLOR, "Школьный двор", "yard");
    createSchoolZone("director_office", new Color(1, 1, 0, 0.3), "Кабинет директора", "office");
    createSchoolZone("teacher_lounge", new Color(0.8, 0.4, 0.8, 0.3), "Учительская", "teachers");
    createSchoolZone("cleaning_area", new Color(0.6, 0.6, 0.6, 0.4), "Зона уборки", "cleaning");
}

function createSchoolZone(name, color, hintText, tag) {
    try {
        // Создаем триггер зоны
        const trigger = AreaPlayerTriggerService.Get(name);
        trigger.Tags = [tag];
        trigger.Enable = true;
        
        // Создаем визуальное отображение зоны
        const view = AreaViewService.GetContext().Get(name + "_view");
        view.Color = color;
        view.Tags = [tag];
        view.Enable = true;
        
        // Обработчики входа и выхода
        trigger.OnEnter.Add(function(player, area) {
            player.Ui.Hint.Value = hintText;
            handleZoneEnter(player, tag);
        });
        
        trigger.OnExit.Add(function(player, area) {
            player.Ui.Hint.Value = "";
            handleZoneExit(player, tag);
        });
        
        console.log(`Зона ${name} создана с тегом ${tag}`);
    } catch (error) {
        console.error(`Ошибка создания зоны ${name}:`, error);
    }
}

// Обработка входа в зону
function handleZoneEnter(player, tag) {
    const role = player.Properties.Get('Role').Value;
    
    switch(tag) {
        case "cafeteria":
            startEating(player);
            break;
            
        case "gym":
            if (schoolMode.state === SchoolStates.BREAK && role === 'student') {
                player.Ui.Hint.Value += "\nИспользуй /exercise для тренировки";
            }
            break;
            
        case "library":
            if (schoolMode.state !== SchoolStates.LESSON && role === 'student') {
                player.Ui.Hint.Value += "\nИспользуй /study для учебы";
            }
            break;
            
        case "cleaning":
            if (schoolMode.state === SchoolStates.BREAK && role === 'student') {
                player.Ui.Hint.Value += "\nИспользуй /clean для уборки";
            }
            break;
            
        case "detention":
            if (schoolMode.detentionPlayers.has(player.Id)) {
                player.Ui.Hint.Value += `\nОсталось: ${getDetentionTimeLeft(player)} сек`;
            }
            break;
    }
}

// Обработка выхода из зоны
function handleZoneExit(player, tag) {
    switch(tag) {
        case "cafeteria":
            stopEating(player);
            break;
            
        case "cleaning":
            stopCleaning(player);
            break;
    }
}

// Управление состоянием игры
function setSchoolState(newState) {
    schoolMode.state = newState;
    Props.Get('Game_State').Value = newState;
    
    switch(newState) {
        case SchoolStates.MORNING:
            Ui.GetContext().Hint.Value = "Утренняя линейка! Постройтесь по классам!";
            startMorningAssembly();
            break;
            
        case SchoolStates.LESSON:
            Ui.GetContext().Hint.Value = "Идет урок! Скорее в класс!";
            startLesson();
            break;
            
        case SchoolStates.BREAK:
            Ui.GetContext().Hint.Value = "Перемена! Можно отдохнуть!";
            startBreak();
            break;
            
        case SchoolStates.MEETING:
            Ui.GetContext().Hint.Value = "Общее собрание! Все в актовый зал!";
            startMeeting();
            break;
            
        case SchoolStates.EXAM:
            Ui.GetContext().Hint.Value = "Экзамен! Займите свои места!";
            startExam();
            break;
            
        case SchoolStates.END:
            Ui.GetContext().Hint.Value = "Учебный день окончен!";
            endSchoolDay();
            break;
    }
}

// Утренняя линейка
function startMorningAssembly() {
    let assemblyTime = 60;
    Props.Get('Time_Left').Value = assemblyTime;
    
    const assemblyTimer = Timers.GetContext().Get("AssemblyTimer");
    assemblyTimer.OnTimer.Add(function() {
        assemblyTime--;
        Props.Get('Time_Left').Value = assemblyTime;
        
        if (assemblyTime <= 0) {
            setSchoolState(SchoolStates.LESSON);
            return;
        }
        
        // Награда за построение
        Players.All.forEach(player => {
            if (player.Team && AreaPlayerTriggerService.Get("schoolyard").IsPlayerInside(player.Id)) {
                addPlayerScore(player.Id, 2);
            }
        });
        
        assemblyTimer.RestartLoop(1);
    });
    assemblyTimer.RestartLoop(1);
}

// Начать урок
function startLesson() {
    // Выбираем случайный предмет
    const subjects = ["math", "biology", "history"];
    schoolMode.currentLesson = subjects[Math.floor(Math.random() * subjects.length)];
    Props.Get('Current_Lesson').Value = schoolMode.currentLesson;
    
    // Отключаем оружие у учеников
    Players.All.forEach(player => {
        if (player.Properties.Get('Role').Value === 'student') {
            player.Inventory.Melee.Value = false;
        }
    });
    
    // Запускаем таймер урока
    schoolMode.lessonEndTime = LESSON_TIME;
    Props.Get('Time_Left').Value = schoolMode.lessonEndTime;
    
    const lessonTimer = Timers.GetContext().Get("LessonTimer");
    lessonTimer.OnTimer.Add(function() {
        schoolMode.lessonEndTime--;
        Props.Get('Time_Left').Value = schoolMode.lessonEndTime;
        
        if (schoolMode.lessonEndTime <= 0) {
            setSchoolState(SchoolStates.BREAK);
            return;
        }
        
        // Каждые 30 секунд задаем новый вопрос
        if (schoolMode.lessonEndTime % 30 === 0) {
            askNewQuestion();
        }
        
        // Награждаем учеников в классах
        Players.All.forEach(player => {
            if (player.Properties.Get('Role').Value === 'student') {
                const inClass = AreaPlayerTriggerService.Get("class_" + schoolMode.currentLesson).IsPlayerInside(player.Id);
                if (inClass) {
                    addPlayerScore(player.Id, 5);
                    addPlayerEnergy(player.Id, 1);
                } else {
                    addPlayerHunger(player.Id, 1);
                }
            }
        });
        
        lessonTimer.RestartLoop(1);
    });
    lessonTimer.RestartLoop(1);
    
    // Выдаем первое задание
    askNewQuestion();
    
    // Задаем домашнее задание
    assignHomework();
}

// Задать новый вопрос
function askNewQuestion() {
    const questions = {
        math: [
            { id: 1, question: "Сколько будет 2+2*2?", answer: "6" },
            { id: 2, question: "Чему равен корень из 144?", answer: "12" },
            { id: 3, question: "Площадь круга с радиусом 3?", answer: "28.27" }
        ],
        biology: [
            { id: 1, question: "Сколько хромосом у человека?", answer: "46" },
            { id: 2, question: "Основная функция митохондрий?", answer: "энергия" },
            { id: 3, question: "Самый большой орган человека?", answer: "кожа" }
        ],
        history: [
            { id: 1, question: "Год основания Санкт-Петербурга?", answer: "1703" },
            { id: 2, question: "Первый президент России?", answer: "ельцин" },
            { id: 3, question: "В каком году распался СССР?", answer: "1991" }
        ]
    };
    
    const lessonQuestions = questions[schoolMode.currentLesson];
    const question = lessonQuestions[Math.floor(Math.random() * lessonQuestions.length)];
    
    // Оповещаем игроков
    Players.All.forEach(player => {
        if (player.Properties.Get('Role').Value === 'student') {
            player.Ui.Hint.Value = `📚 Вопрос: ${question.question}\nИспользуй /answer ${question.id} [твой ответ]`;
        }
    });
    
    console.log(`Задан вопрос: ${question.question} (ID: ${question.id})`);
    
    // Сохраняем активный вопрос
    schoolMode.activeQuestion = question;
}

// Задать домашнее задание
function assignHomework() {
    const homework = {
        math: "Решить 5 задач из учебника",
        biology: "Подготовить доклад о млекопитающих",
        history: "Написать эссе о Второй мировой войне"
    };
    
    schoolMode.activeHomework = {
        subject: schoolMode.currentLesson,
        task: homework[schoolMode.currentLesson],
        progress: 0,
        maxProgress: 5
    };
    
    Players.All.forEach(player => {
        if (player.Properties.Get('Role').Value === 'student') {
            player.Ui.Hint.Value += `\n📝 Домашнее задание: ${schoolMode.activeHomework.task}`;
        }
    });
    
    Props.Get('Homework_Progress').Value = 0;
}

// Начать перемену
function startBreak() {
    // Разрешаем "хулиганить" (включаем оружие)
    Players.All.forEach(player => {
        if (player.Properties.Get('Role').Value === 'student') {
            player.Inventory.Melee.Value = true;
            addPlayerHunger(player.Id, 20); // Голод после урока
        }
    });
    
    // Сбрасываем прогресс уборки
    schoolMode.cleaningAreas.clear();
    Props.Get('Cleaning_Progress').Value = 0;
    
    // Запускаем таймер перемены
    let breakTime = BREAK_TIME;
    Props.Get('Time_Left').Value = breakTime;
    
    const breakTimer = Timers.GetContext().Get("BreakTimer");
    
    breakTimer.OnTimer.Add(function() {
        breakTime--;
        Props.Get('Time_Left').Value = breakTime;
        
        if (breakTime <= 0) {
            // Случайно решаем, будет ли экзамен или собрание
            if (Math.random() > 0.8) {
                setSchoolState(SchoolStates.EXAM);
            } else if (Math.random() > 0.6) {
                setSchoolState(SchoolStates.MEETING);
            } else {
                setSchoolState(SchoolStates.LESSON);
            }
            return;
        }
        
        // Уменьшаем энергию и увеличиваем голод
        Players.All.forEach(player => {
            if (player.Properties.Get('Role').Value === 'student') {
                addPlayerEnergy(player.Id, -1);
                addPlayerHunger(player.Id, 1);
                
                // Проверка голода
                if (getPlayerHunger(player.Id) >= 100) {
                    player.Health.Value -= 5;
                    player.Ui.Hint.Value = "Вы голодаете! Сходите в столовую!";
                }
            }
        });
        
        breakTimer.RestartLoop(1);
    });
    breakTimer.RestartLoop(1);
}

// Начать собрание
function startMeeting() {
    let meetingTime = 60;
    Props.Get('Time_Left').Value = meetingTime;
    
    const meetingTimer = Timers.GetContext().Get("MeetingTimer");
    
    meetingTimer.OnTimer.Add(function() {
        meetingTime--;
        Props.Get('Time_Left').Value = meetingTime;
        
        if (meetingTime <= 0) {
            // Наказываем игроков не в зале
            Players.All.forEach(player => {
                if (!AreaPlayerTriggerService.Get("gym").IsPlayerInside(player.Id)) {
                    punishPlayer(player, "Пропуск собрания");
                }
            });
            
            setSchoolState(SchoolStates.LESSON);
            return;
        }
        
        meetingTimer.RestartLoop(1);
    });
    meetingTimer.RestartLoop(1);
}

// Начать экзамен
function startExam() {
    // Генерируем вопросы для экзамена
    schoolMode.examQuestions = [];
    const subjects = ["math", "biology", "history"];
    
    subjects.forEach(subject => {
        const questions = {
            math: [
                { id: 1, question: "Чему равно число π с точностью до сотых?", answer: "3.14" },
                { id: 2, question: "Формула площади треугольника?", answer: "s=0.5*a*h" },
                { id: 3, question: "Что больше: 2^10 или 10^3?", answer: "2^10" }
            ],
            biology: [
                { id: 1, question: "Сколько камер в сердце человека?", answer: "4" },
                { id: 2, question: "Основной фотосинтезирующий пигмент?", answer: "хлорофилл" },
                { id: 3, question: "Кто открыл ДНК?", answer: "уотсон" }
            ],
            history: [
                { id: 1, question: "Год крещения Руси?", answer: "988" },
                { id: 2, question: "Первая столица Древней Руси?", answer: "новгород" },
                { id: 3, question: "Кто написал 'Слово о полку Игореве'?", answer: "неизвестно" }
            ]
        };
        
        schoolMode.examQuestions = schoolMode.examQuestions.concat(questions[subject]);
    });
    
    // Перемешиваем вопросы
    schoolMode.examQuestions.sort(() => Math.random() - 0.5);
    
    // Запускаем первый вопрос
    askExamQuestion();
}

// Задать экзаменационный вопрос
function askExamQuestion() {
    if (schoolMode.examQuestions.length === 0) {
        // Экзамен завершен
        setSchoolState(SchoolStates.LESSON);
        return;
    }
    
    schoolMode.activeQuestion = schoolMode.examQuestions.shift();
    Props.Get('Time_Left').Value = EXAM_QUESTION_TIME;
    
    // Оповещаем игроков
    Players.All.forEach(player => {
        if (player.Properties.Get('Role').Value === 'student') {
            player.Ui.Hint.Value = `📝 Экзамен: ${schoolMode.activeQuestion.question}\nИспользуй /answer [твой ответ]`;
        }
    });
    
    // Запускаем таймер для вопроса
    if (schoolMode.examTimer) {
        schoolMode.examTimer.Stop();
    }
    
    schoolMode.examTimer = Timers.GetContext().Get("ExamTimer");
    let timeLeft = EXAM_QUESTION_TIME;
    
    schoolMode.examTimer.OnTimer.Add(function() {
        timeLeft--;
        Props.Get('Time_Left').Value = timeLeft;
        
        if (timeLeft <= 0) {
            // Переходим к следующему вопросу
            askExamQuestion();
        }
    });
    schoolMode.examTimer.RestartLoop(1);
}

// Завершить учебный день
function endSchoolDay() {
    // Определяем победителей
    let bestStudent = null;
    let bestTeacher = null;
    let maxStudentScore = 0;
    let maxTeacherScore = 0;
    
    Players.All.forEach(player => {
        const role = player.Properties.Get('Role').Value;
        const score = schoolMode.playerScores.get(player.Id) || 0;
        
        if (role === 'student' && score > maxStudentScore) {
            maxStudentScore = score;
            bestStudent = player;
        }
        
        if (role === 'teacher' && score > maxTeacherScore) {
            maxTeacherScore = score;
            bestTeacher = player;
        }
    });
    
    // Объявляем результаты
    if (bestStudent) {
        Ui.GetContext().Hint.Value += `\n🎓 Лучший ученик: ${bestStudent.NickName} (${maxStudentScore} очков)`;
        bestStudent.Inventory.Main.Value = true; // Награда
    }
    
    if (bestTeacher) {
        Ui.GetContext().Hint.Value += `\n🏆 Лучший учитель: ${bestTeacher.NickName} (${maxTeacherScore} очков)`;
    }
    
    // Перезапускаем игру через 30 секунд
    const endTimer = Timers.GetContext().Get("EndTimer");
    endTimer.OnTimer.Add(function() {
        initSchoolMode();
    });
    endTimer.Restart(30);
}

// Наказать игрока
function punishPlayer(player, reason) {
    if (player.Properties.Get('Role').Value === 'director') return;
    
    // Телепортируем в карцер
    const detentionZone = AreaViewService.GetContext().Get("detention_view");
    player.SetPositionAndRotation(detentionZone.Position, player.Rotation);
    
    // Отбираем оружие
    player.Inventory.Melee.Value = false;
    
    // Запускаем таймер наказания
    schoolMode.detentionPlayers.add(player.Id);
    
    player.Ui.Hint.Value = `⛔ Вы наказаны! Причина: ${reason}`;
    console.log(`Игрок ${player.NickName} наказан: ${reason}`);
    
    const detentionTimer = Timers.GetContext(player).Get("DetentionTimer");
    detentionTimer.OnTimer.Add(function() {
        schoolMode.detentionPlayers.delete(player.Id);
        player.Spawns.Spawn();
        player.Ui.Hint.Value = "Вы освобождены из карцера!";
    });
    detentionTimer.Restart(DETENTION_TIME);
}

// Получить оставшееся время наказания
function getDetentionTimeLeft(player) {
    const timer = Timers.GetContext(player).Get("DetentionTimer");
    return timer ? Math.ceil(timer.TimeLeft) : 0;
}

// Добавить очки игроку
function addPlayerScore(playerId, points) {
    const currentScore = schoolMode.playerScores.get(playerId) || 0;
    const newScore = currentScore + points;
    schoolMode.playerScores.set(playerId, newScore);
    
    // Обновляем общий счет
    let totalScore = 0;
    schoolMode.playerScores.forEach(score => {
        totalScore += score;
    });
    Props.Get('Total_Score').Value = totalScore;
    
    // Проверка победы
    if (totalScore >= MAX_SCORE) {
        setSchoolState(SchoolStates.END);
    }
    
    // Обновление свойства игрока
    const player = Players.Get(playerId);
    if (player) {
        player.Properties.Get('Score').Value = newScore;
    }
    
    return newScore;
}

// Управление энергией игрока
function addPlayerEnergy(playerId, points) {
    const currentEnergy = schoolMode.playerEnergy.get(playerId) || 100;
    const newEnergy = Math.max(0, Math.min(100, currentEnergy + points));
    schoolMode.playerEnergy.set(playerId, newEnergy);
    
    // Обновляем свойство игрока
    const player = Players.Get(playerId);
    if (player) {
        player.Properties.Get('Energy').Value = newEnergy;
    }
    
    return newEnergy;
}

function getPlayerEnergy(playerId) {
    return schoolMode.playerEnergy.get(playerId) || 100;
}

// Управление голодом игрока
function addPlayerHunger(playerId, points) {
    const currentHunger = schoolMode.playerHunger.get(playerId) || 0;
    const newHunger = Math.max(0, Math.min(100, currentHunger + points));
    schoolMode.playerHunger.set(playerId, newHunger);
    
    // Обновляем свойство игрока
    const player = Players.Get(playerId);
    if (player) {
        player.Properties.Get('Hunger').Value = newHunger;
    }
    
    return newHunger;
}

function getPlayerHunger(playerId) {
    return schoolMode.playerHunger.get(playerId) || 0;
}

// Обработчик ответов на вопросы
function handleAnswer(player, answer) {
    if (!schoolMode.activeQuestion) {
        player.Ui.Hint.Value = "Сейчас нет активных вопросов!";
        return;
    }
    
    // Проверяем ответ
    if (answer.toLowerCase() === schoolMode.activeQuestion.answer.toLowerCase()) {
        const newScore = addPlayerScore(player.Id, schoolMode.state === SchoolStates.EXAM ? 200 : 100);
        player.Ui.Hint.Value = `✅ Правильно! +${schoolMode.state === SchoolStates.EXAM ? 200 : 100} очков (Всего: ${newScore})`;
        
        // Для экзамена сразу переходим к следующему вопросу
        if (schoolMode.state === SchoolStates.EXAM) {
            askExamQuestion();
        }
    } else {
        player.Ui.Hint.Value = "❌ Неверно! Попробуй еще раз";
    }
}

// Начать прием пищи
function startEating(player) {
    const eatTimer = Timers.GetContext(player).Get("EatTimer");
    
    eatTimer.OnTimer.Add(function() {
        const hunger = addPlayerHunger(player.Id, -5);
        addPlayerEnergy(player.Id, 2);
        
        player.Ui.Hint.Value = `🍎 Прием пищи... Голод: ${hunger}%`;
        
        if (hunger <= 0) {
            eatTimer.Stop();
            player.Ui.Hint.Value = "Вы сыты!";
        }
    });
    eatTimer.RestartLoop(5);
}

// Остановить прием пищи
function stopEating(player) {
    const eatTimer = Timers.GetContext(player).Get("EatTimer");
    if (eatTimer) eatTimer.Stop();
}

// Начать уборку
function startCleaning(player) {
    if (!schoolMode.cleaningAreas.has("cleaning_area")) {
        schoolMode.cleaningAreas.add("cleaning_area");
    }
    
    const cleanTimer = Timers.GetContext(player).Get("CleanTimer");
    
    cleanTimer.OnTimer.Add(function() {
        const progress = Props.Get('Cleaning_Progress').Value + 1;
        Props.Get('Cleaning_Progress').Value = progress;
        
        addPlayerScore(player.Id, 10);
        addPlayerEnergy(player.Id, -3);
        
        player.Ui.Hint.Value = `🧹 Уборка... Прогресс: ${progress}%`;
        
        if (progress >= 100) {
            cleanTimer.Stop();
            player.Ui.Hint.Value = "Уборка завершена! +100 очков";
            addPlayerScore(player.Id, 100);
            schoolMode.cleaningAreas.delete("cleaning_area");
        }
    });
    cleanTimer.RestartLoop(3);
}

// Остановить уборку
function stopCleaning(player) {
    const cleanTimer = Timers.GetContext(player).Get("CleanTimer");
    if (cleanTimer) cleanTimer.Stop();
}

// Генератор ответов "нейросети"
function getNeuroResponse(question) {
    // Простая эмуляция ИИ
    const keywords = {
        "математик": "Математика - царица наук!",
        "биологи": "Жизнь удивительна в своем разнообразии",
        "истори": "История учит нас не повторять ошибок прошлого",
        "оценк": "Главное - знания, а не оценки",
        "дом": "Домашняя работа помогает закрепить материал",
        "учител": "Учителя - наши проводники в мир знаний",
        "перемен": "Перемена нужна для отдыха и восстановления",
        "еда|столов|голод": "Столовая находится в западном крыле школы",
        "спорт|физра": "Спортзал открыт на переменах и после уроков",
        "библиотек": "В библиотеке можно взять учебники",
        "директор": "Директор обычно находится в своем кабинете",
        "расписан": "Расписание уроков: 1. Математика, 2. Биология, 3. История"
    };
    
    // Поиск по ключевым словам
    const lowerQuestion = question.toLowerCase();
    for (const [key, response] of Object.entries(keywords)) {
        if (new RegExp(key).test(lowerQuestion)) {
            return response;
        }
    }
    
    // Случайный ответ если не найдено ключевых слов
    return schoolMode.neuroResponses[Math.floor(Math.random() * schoolMode.neuroResponses.length)];
}

// Система ролей
function assignRoles() {
    const players = Players.All;
    
    // Сбрасываем роли
    schoolMode.director = null;
    schoolMode.teachers = [];
    
    // Назначаем директора (случайный игрок с высоким рейтингом)
    const sortedPlayers = [...players].sort((a, b) => {
        return (schoolMode.playerScores.get(b.Id) || 0) - (schoolMode.playerScores.get(a.Id) || 0);
    });
    
    if (sortedPlayers.length > 0) {
        schoolMode.director = sortedPlayers[0];
        schoolMode.director.Properties.Get('Role').Value = 'director';
        schoolMode.director.Properties.Get('IsVIP').Value = true;
        Props.Get('Director').Value = schoolMode.director.NickName;
    }
    
    // Назначаем учителей (2-3 игрока)
    const teacherCount = Math.min(3, Math.max(1, Math.floor(players.length / 3)));
    for (let i = 1; i <= teacherCount; i++) {
        if (sortedPlayers[i]) {
            sortedPlayers[i].Properties.Get('Role').Value = 'teacher';
            sortedPlayers[i].Inventory.Main.Value = true; // Указка
            schoolMode.teachers.push(sortedPlayers[i]);
        }
    }
    
    // Остальные - ученики
    for (let i = teacherCount + 1; i < sortedPlayers.length; i++) {
        if (sortedPlayers[i]) {
            sortedPlayers[i].Properties.Get('Role').Value = 'student';
            sortedPlayers[i].Inventory.Melee.Value = false;
        }
    }
}

// Лидерборд
function setupLeaderboard() {
    LeaderBoard.PlayerLeaderBoardValues = [
        new DisplayValueHeader('Role', 'Роль', 'Роль'),
        new DisplayValueHeader('Score', 'Очки', 'Очки'),
        new DisplayValueHeader('Class', 'Класс', 'Класс'),
        new DisplayValueHeader('Energy', 'Энергия', 'Энергия'),
        new DisplayValueHeader('Hunger', 'Голод', 'Голод')
    ];

    LeaderBoard.PlayersWeightGetter.Set(function(player) {
        return schoolMode.playerScores.get(player.Id) || 0;
    });
}

// Инициализация игрока
function initPlayer(player) {
    player.Properties.Get('Role').Value = 'student';
    player.Properties.Get('Score').Value = 0;
    player.Properties.Get('Energy').Value = 100;
    player.Properties.Get('Hunger').Value = 0;
    player.Properties.Get('IsVIP').Value = false;
    player.Inventory.Main.Value = false;
    player.Inventory.Secondary.Value = false;
    player.Inventory.Melee.Value = false;
    player.Inventory.Build.Value = false;
    
    // Добавляем в случайный класс
    const classes = [ClassA, ClassB, ClassC];
    const randomClass = classes[Math.floor(Math.random() * classes.length)];
    randomClass.Add(player);
    
    // Начальные значения
    schoolMode.playerScores.set(player.Id, 0);
    schoolMode.playerEnergy.set(player.Id, 100);
    schoolMode.playerHunger.set(player.Id, 0);
    
    player.Ui.Hint.Value = 'Добро пожаловать в школу! /help - список команд';
}

// Команды чата (расширенные)
function initChatCommands() {
    ChatCtx.OnMessage.Add(function(message) {
        const msg = message.Text.trim();
        const sender = Players.GetByRoomId(message.Sender);
        if (!sender) return;

        const args = msg.split(' ');
        const command = args[0].toLowerCase();
        const role = sender.Properties.Get('Role').Value;

                // Выполнение домашнего задания
        else if (command === '/homework') {
            if (!schoolMode.activeHomework) {
                sender.Ui.Hint.Value = "❌ Сейчас нет домашнего задания!";
                return;
            }
            
            if (!AreaPlayerTriggerService.Get("class_" + schoolMode.activeHomework.subject).IsPlayerInside(sender.Id)) {
                sender.Ui.Hint.Value = `❌ Ты не в классе ${schoolMode.activeHomework.subject}!`;
                return;
            }
            
            const homeworkTimer = Timers.GetContext(sender).Get("HomeworkTimer");
            homeworkTimer.OnTimer.Add(function() {
                schoolMode.activeHomework.progress++;
                Props.Get('Homework_Progress').Value = (schoolMode.activeHomework.progress / schoolMode.activeHomework.maxProgress) * 100;
                
                if (schoolMode.activeHomework.progress >= schoolMode.activeHomework.maxProgress) {
                    homeworkTimer.Stop();
                    addPlayerScore(sender.Id, 150);
                    sender.Ui.Hint.Value = "✅ Домашнее задание выполнено! +150 очков";
                } else {
                    sender.Ui.Hint.Value = `📝 Делаю домашку... ${schoolMode.activeHomework.progress}/${schoolMode.activeHomework.maxProgress}`;
                }
            });
            homeworkTimer.Restart(10);
        }
        
        // Завершить учебный день (директор)
        else if (command === '/endday') {
            if (role !== 'director') {
                sender.Ui.Hint.Value = "❌ Только для директора!";
                return;
            }
            
            setSchoolState(SchoolStates.END);
        }
    });
}

// Обработчики событий
function setupEventHandlers() {
    // При подключении игрока
    Players.OnPlayerConnected.Add(function(player) {
        initPlayer(player);
        assignRoles();
        
        if (Players.All.length >= 2 && schoolMode.state === SchoolStates.MORNING) {
            const morningTimer = Timers.GetContext().Get("MorningTimer");
            morningTimer.OnTimer.Add(function() {
                if (Players.All.length >= 3) {
                    setSchoolState(SchoolStates.LESSON);
                }
            });
            morningTimer.Restart(30);
        }
    });
    
    // При отключении игрока
    Players.OnPlayerDisconnected.Add(function(player) {
        schoolMode.playerScores.delete(player.Id);
        schoolMode.playerEnergy.delete(player.Id);
        schoolMode.playerHunger.delete(player.Id);
        schoolMode.detentionPlayers.delete(player.Id);
        assignRoles();
    });
    
    // При убийстве (хулиганство)
    Damage.OnKill.Add(function(killer, victim) {
        if (schoolMode.state !== SchoolStates.BREAK) {
            // Возвращаем к жизни если убийство не на перемене
            victim.Spawns.Spawn();
            return;
        }
        
        // Наказываем хулигана
        if (killer.Properties.Get('Role').Value === 'student') {
            punishPlayer(killer, "Драка на перемене");
            killer.Ui.Hint.Value = "⛔ Драки запрещены!";
        }
        
        // Возвращаем жертву
        victim.Spawns.Spawn();
    });
    
    // При смерти
    Damage.OnDeath.Add(function(player) {
        player.Spawns.Spawn();
        addPlayerEnergy(player.Id, -30);
        player.Ui.Hint.Value = "Ты умер! -30 энергии";
    });
}

// Основная инициализация
function initSchoolMode() {
    // Сброс состояния
    schoolMode.state = SchoolStates.MORNING;
    schoolMode.currentLesson = "math";
    schoolMode.playerScores.clear();
    schoolMode.playerEnergy.clear();
    schoolMode.playerHunger.clear();
    schoolMode.detentionPlayers.clear();
    schoolMode.activeQuestion = null;
    schoolMode.activeHomework = null;
    schoolMode.cleaningAreas.clear();
    schoolMode.director = null;
    schoolMode.teachers = [];
    
    // Инициализация систем
    initServerProperties();
    setupTeams(); // Пересоздаем команды
    setupSchoolZones();
    setupLeaderboard();
    initChatCommands();
    setupEventHandlers();
    
    // Назначаем роли
    assignRoles();
    
    // Запускаем утреннее состояние
    setSchoolState(SchoolStates.MORNING);
}

// Запуск игры
initSchoolMode();                  
