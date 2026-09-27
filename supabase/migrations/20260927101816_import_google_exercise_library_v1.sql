create temporary table tmp_exercise_seed(
  code text, name text, exercise_type text, tracking_type text, equipment_code text,
  movement_pattern_code text, is_unilateral boolean, aliases text[],
  description text, instructions text, setup_notes text, common_mistakes text,
  primary_codes text[], secondary_codes text[], stabilizer_codes text[], default_rest_seconds integer
) on commit drop;

insert into tmp_exercise_seed values
('QUAD_GLUTE_BULGARIAN_SPLIT','Болгарские сплит-приседы','compound','weight_reps','dumbbell','lunge',true,array['Болгарские приседы','Болгарские сплит приседания','Болгарские сплит приседы. опускаемся низко','Болгарские сплит-приседания']::text[],null,null,null,null,array['quads','glutes']::text[],array['hamstrings']::text[],array['core']::text[],150),
('CHEST_UPPER_DB_PRESS','Жим гантелей на наклонной скамье 25–35°','compound','weight_reps','dumbbell','incline_push',false,array['Жим гантелей лежа в наклоне']::text[],null,null,null,null,array['chest_upper']::text[],array['triceps','delts_front']::text[],array[]::text[],150),
('BACK_LAT_NEUTRAL_PULL','Тяга верхнего блока нейтральным хватом к груди','compound','weight_reps','cable','vertical_pull',false,array['Вертикальная тяга','Вертикальная тяга к груди','Вертикальная тяга в тренажере']::text[],null,null,null,null,array['lats']::text[],array['back_mid','biceps']::text[],array[]::text[],150),
('BACK_MID_CABLE_ROW','Горизонтальная тяга в блочном тренажёре','compound','weight_reps','cable','horizontal_pull',false,array['Горизонтальная тяга к животу']::text[],null,null,null,null,array['back_mid']::text[],array['lats','biceps']::text[],array[]::text[],150),
('BACK_MID_DB_ROW','Тяга гантели одной рукой с опорой','compound','weight_reps','dumbbell','horizontal_pull',true,array['Тяга гантели в наклоне одной рукой','Тяга гантели одной рукой в наклоне']::text[],null,null,null,null,array['back_mid']::text[],array['lats','biceps']::text[],array['core']::text[],150),
('DELTS_SIDE_DB_RAISE','Разведение гантелей стоя в стороны','isolation','weight_reps','dumbbell','lateral_raise',false,array['Махи гантелей в стороны','Махи в стороны гантелей','Махи гантелей в стороны. медленно опускаем']::text[],null,null,null,null,array['delts_side']::text[],array['traps']::text[],array[]::text[],90),
('TRAPS_FARMER_WALK','Фермерская прогулка','compound','weight_distance','dumbbell','loaded_carry',false,array['Фермерская прогулка с гантелью']::text[],null,null,null,null,array['traps','forearms']::text[],array[]::text[],array['core']::text[],120),
('TRICEPS_FRENCH_DB','Французский жим с гантелью сидя','isolation','weight_reps','dumbbell','elbow_extension',false,array['Жим гантелей на трицепс']::text[],null,null,null,null,array['triceps']::text[],array[]::text[],array[]::text[],90),
('BAND_CRAB_WALK','Боковая ходьба с резинкой («крабик»)','isolation','reps_only','bands','hip_abduction',false,array['Крабик']::text[],'Отведение бедра в боковой ходьбе с постоянным натяжением резинки; акцент на средней ягодичной.','Сохраняй колени по линии стоп и делай короткие контролируемые шаги в сторону.','Резинка над коленями или у лодыжек; лёгкий присед, таз стабилен.','Колени заваливаются внутрь; слишком широкий шаг; раскачка корпуса.',array['glutes_medius']::text[],array['glutes']::text[],array['core']::text[],45),
('GLUTE_BAND_BRIDGE','Ягодичный мостик с резинкой','compound','reps_only','bands','hip_thrust',false,array['Мостик с резинкой']::text[],'Ягодичный мост с дополнительным сопротивлением резинки на отведение бедра.','Поднимай таз за счёт разгибания бедра, удерживая колени слегка разведёнными.','Стопы устойчиво на полу, резинка над коленями.','Переразгибание поясницы; толчок носками; колени сходятся внутрь.',array['glutes']::text[],array['hamstrings','glutes_medius']::text[],array['core']::text[],60),
('HIP_ABD_BAND_SEATED','Разведение коленей сидя с резинкой','isolation','reps_only','bands','hip_abduction',false,array['Разведение ног с резиной','Разведение ног с резиной сидя']::text[],'Изолирующее отведение бедра сидя с акцентом на среднюю ягодичную.','Разводи колени наружу до контролируемой амплитуды и медленно возвращай.','Резинка над коленями, стопы устойчиво, корпус стабилен.','Рывки; движение стопами вместо бедра; потеря натяжения резинки.',array['glutes_medius']::text[],array['glutes']::text[],array[]::text[],45),
('HIP_ABD_BAND_STANDING','Отведение ноги в сторону стоя с резинкой','isolation','reps_only','bands','hip_abduction',true,array['Отведение ноги с резинкой стоя']::text[],'Одностороннее отведение бедра стоя для средней ягодичной.','Отводи прямую или слегка согнутую ногу в сторону без наклона корпуса.','Опорная нога мягкая, таз смотрит вперёд; при необходимости держись за опору.','Наклон корпуса; разворот стопы наружу; мах вместо контроля.',array['glutes_medius']::text[],array['glutes']::text[],array['core']::text[],45),
('HIP_ABD_CABLE','Отведение ноги в сторону в кроссовере','isolation','weight_reps','cable','hip_abduction',true,array['Махи в стороны ногой в кроссовере']::text[],'Отведение бедра с постоянным сопротивлением блока.','Отводи ногу в сторону, сохраняя таз неподвижным.','Манжета на рабочей ноге, корпус вертикален, опорная нога слегка согнута.','Раскачка; разворот таза; слишком большой вес.',array['glutes_medius']::text[],array['glutes']::text[],array['core']::text[],60),
('GLUTE_KICKBACK_CABLE','Отведение ноги назад в кроссовере','isolation','weight_reps','cable','hip_extension',true,array['Махи ногой назад','Махи ногой назад в кроссовере','Махи ногой назад на попу','Махи ногой назад на попу. прям до сильного жжения']::text[],'Изолирующее разгибание бедра с акцентом на большую ягодичную.','Отводи бедро назад без переразгибания поясницы и возвращай подконтрольно.','Манжета на голени или лодыжке, корпус стабилен, таз нейтрален.','Прогиб поясницы; мах ногой; разворот таза.',array['glutes']::text[],array['hamstrings']::text[],array['core']::text[],60),
('GLUTE_FROG_PUMP','Ягодичный мост «лягушка»','isolation','reps_only','bodyweight','hip_thrust',false,array['Мостик яголичный - лягушка']::text[],'Мост с соединёнными стопами и разведёнными коленями для локальной работы ягодиц.','Поднимай таз до сокращения ягодиц, не компенсируя движением поясницы.','Стопы вместе, колени разведены, поясница нейтральна.','Чрезмерный прогиб; слишком большая амплитуда; движение за счёт поясницы.',array['glutes']::text[],array['glutes_medius']::text[],array[]::text[],45),
('GLUTE_HIP_THRUST_BB','Ягодичный мост / hip thrust со штангой','compound','weight_reps','barbell','hip_thrust',false,array['Ягодичный мостик со штангой','Ягодичный мостик от скамьи с весом']::text[],'Тяжёлое разгибание таза с основным акцентом на ягодичные.','Поднимай таз до нейтрального положения корпуса и бёдер, сжимая ягодицы вверху.','Лопатки на скамье, гриф над складкой таза, стопы устойчиво.','Переразгибание поясницы; стопы слишком далеко; отрыв пяток.',array['glutes']::text[],array['hamstrings']::text[],array['core']::text[],150),
('GLUTE_HIP_THRUST_SMITH','Ягодичный мост в Смите','compound','weight_reps','smith','hip_thrust',false,array['Ягодичный мостик со штангой в смите']::text[],'Hip thrust по фиксированной траектории Смита.','Разгибай таз до нейтрали и подконтрольно опускайся.','Скамья устойчива, гриф над тазом, стопы подобраны так, чтобы вверху голени были близки к вертикали.','Переразгибание; слишком узкая постановка; отрыв пяток.',array['glutes']::text[],array['hamstrings']::text[],array['core']::text[],150),
('GLUTE_BRIDGE_WEIGHTED','Ягодичный мостик с весом с пола','compound','weight_reps','other','hip_thrust',false,array['Ягодичный мостик с весом']::text[],'Разгибание таза лёжа на полу с внешним отягощением.','Поднимай таз до полного сокращения ягодиц без прогиба поясницы.','Вес расположен на тазу, стопы устойчиво и симметрично.','Толчок поясницей; отрыв пяток; колени внутрь.',array['glutes']::text[],array['hamstrings']::text[],array['core']::text[],120),
('GLUTE_SINGLE_LEG_BRIDGE','Ягодичный мостик на одной ноге','compound','reps_only','bodyweight','hip_thrust',true,array['Ягодичный мостик на одной ноге']::text[],'Одностороннее разгибание таза с повышенным требованием к стабильности.','Поднимай таз усилием опорной ноги, удерживая таз горизонтально.','Одна стопа на полу, вторая нога свободна; корпус симметричен.','Разворот таза; толчок поясницей; потеря опоры пяткой.',array['glutes']::text[],array['hamstrings']::text[],array['core']::text[],75),
('LUNGE_STATIONARY_DB','Выпады на месте с гантелями','compound','weight_reps','dumbbell','lunge',true,array['Выпады на месте с гантелями']::text[],'Одностороннее коленно-доминантное упражнение на квадрицепс и ягодицы.','Опускайся вертикально между ногами и поднимайся усилием передней ноги.','Стойка достаточно длинная для устойчивого движения, стопы не на одной линии.','Колено заваливается внутрь; толчок задней ногой; потеря баланса.',array['quads','glutes']::text[],array['hamstrings']::text[],array['core']::text[],120),
('LUNGE_GOBLET','Кубковые выпады','compound','weight_reps','dumbbell','lunge',true,array['Кубоковые выпады']::text[],'Выпады с одной гантелью у груди; удобный вариант для контроля корпуса.','Держи гантель у груди и выполняй выпад с устойчивым коленом и тазом.','Гантель в положении goblet, корпус собран.','Скругление корпуса; колено внутрь; слишком короткий шаг.',array['quads','glutes']::text[],array['hamstrings']::text[],array['core']::text[],120),
('LUNGE_WALKING_DB','Выпады в ходьбе с гантелями','compound','weight_reps','dumbbell','lunge',true,array['Выпады в ходьбе с гантелями']::text[],'Чередующиеся выпады вперёд в движении с гантелями.','Шагай в выпад, стабилизируй переднюю ногу и переходи в следующий шаг без рывка.','Гантели вдоль корпуса, взгляд вперёд.','Слишком узкая линия шага; колено внутрь; завал корпуса.',array['quads','glutes']::text[],array['hamstrings']::text[],array['core']::text[],120),
('STEP_UP_DB','Зашагивания на платформу с гантелями','compound','weight_reps','step_platform','step_up',true,array['Зашагивания на степ с гантелями']::text[],'Одностороннее зашагивание с акцентом на квадрицепс и ягодицы.','Поднимайся за счёт ноги на платформе, минимально отталкиваясь второй ногой.','Высота платформы позволяет сохранять таз и колено под контролем.','Сильный толчок нижней ногой; колено внутрь; падение с платформы.',array['quads','glutes']::text[],array['hamstrings']::text[],array['core']::text[],120),
('SUMO_GOBLET_SQUAT','Плие / сумо-присед с гантелью','compound','weight_reps','dumbbell','squat',false,array['Плие приседания','Плие приседания с гантелью. Ноги широко','Приседания Плие']::text[],'Присед с широкой постановкой ног и гантелью, нагружающий ягодицы, квадрицепс и приводящие.','Садись между бёдер, веди колени по направлению носков и вставай без рывка.','Широкая стойка, носки умеренно наружу, гантель перед тазом или у груди.','Колени внутрь; чрезмерный разворот стоп; потеря нейтрали спины.',array['glutes','quads','adductors']::text[],array['hamstrings']::text[],array['core']::text[],120),
('SUMO_BB_SQUAT','Присед со штангой с широкой постановкой','compound','weight_reps','barbell','squat',false,array['Приседания со штаной широко ноги']::text[],'Широкий присед со штангой с заметной работой ягодиц и приводящих.','Опускайся подконтрольно, сохраняя колени по линии стоп и стабильный корпус.','Ширина стойки комфортная для таза, штанга стабильно расположена на спине.','Колени внутрь; потеря брейсинга; чрезмерная ширина стойки.',array['quads','glutes','adductors']::text[],array['hamstrings']::text[],array['core','erectors']::text[],180),
('LEG_PRESS_HIGH_FEET','Жим ногами с высокой постановкой стоп','compound','weight_reps','machine','squat',false,array['Жим ногами. ноги высоко на платформе','Жим двумя ногами - ноги высоко']::text[],'Жим ногами с более высокой постановкой стоп, обычно сильнее вовлекающий ягодицы и заднюю поверхность бедра.','Опускай платформу до глубины, при которой таз остаётся прижатым, затем выжимай без блокировки коленей.','Стопы выше центра платформы, поясница и таз прижаты к спинке.','Подкручивание таза; колени внутрь; слишком глубокая амплитуда.',array['glutes','quads']::text[],array['hamstrings']::text[],array[]::text[],150),
('LEG_PRESS_SINGLE','Жим ногами одной ногой','compound','weight_reps','machine','squat',true,array['Жим одной ногой в жиме ногами']::text[],'Односторонний жим ногой в тренажёре для независимой нагрузки сторон.','Опускай платформу подконтрольно одной ногой и выжимай без разворота таза.','Таз полностью на спинке, рабочая стопа устойчиво на платформе.','Таз разворачивается; колено внутрь; чрезмерная глубина.',array['quads','glutes']::text[],array['hamstrings']::text[],array['core']::text[],120),
('RDL_BB','Румынская тяга со штангой','compound','weight_reps','barbell','hinge',false,array['Румынская тяга со штангой']::text[],'Тазовый шарнир со штангой для задней поверхности бедра и ягодиц.','Отводи таз назад при мягких коленях, веди гриф вдоль ног и вставай разгибанием таза.','Стопы примерно на ширине таза, хват чуть шире ног, спина нейтральна.','Присед вместо наклона; округление спины; гриф далеко от ног.',array['hamstrings','glutes']::text[],array[]::text[],array['erectors','core']::text[],180),
('RDL_SINGLE_DB','Румынская тяга на одной ноге с гантелями','compound','weight_reps','dumbbell','hinge',true,array['Румынская тяга на одной ноге','Румынская тяга с гантелями на одной ноге']::text[],'Односторонний тазовый шарнир для ягодиц и задней поверхности бедра с высокой нагрузкой на баланс.','Отводи свободную ногу назад и наклоняй корпус как единый блок, сохраняя таз почти параллельно полу.','Опорное колено слегка согнуто; начинай с лёгкого веса.','Раскрытие таза; округление спины; приседание вместо шарнира.',array['hamstrings','glutes']::text[],array[]::text[],array['core','glutes_medius']::text[],120),
('SINGLE_LEG_HINGE_BW','Наклон на одной ноге без веса','compound','reps_only','bodyweight','hinge',true,array['Наклон на одной ноге']::text[],'Облегчённый односторонний тазовый шарнир для техники и баланса.','Отводи таз и свободную ногу назад, сохраняя длинную линию корпуса.','Опорное колено мягкое; при необходимости используй опору рукой.','Разворот таза; сгибание спины; слишком большая амплитуда.',array['hamstrings','glutes']::text[],array[]::text[],array['core','glutes_medius']::text[],60),
('DEADLIFT_BB','Становая тяга со штангой с пола','compound','weight_reps','barbell','hinge',false,array['Становая тяга с пола со штангой']::text[],'Базовая тяга штанги с пола с работой ног, ягодиц и разгибателей спины.','Создай натяжение перед стартом и поднимай штангу, сохраняя её близко к телу.','Гриф над серединой стопы, корпус напряжён, спина нейтральна.','Рывок с пола; округление спины; гриф уходит вперёд.',array['glutes','hamstrings','erectors']::text[],array['quads','traps']::text[],array['core','forearms']::text[],180),
('CHEST_DB_PRESS','Жим гантелей лёжа','compound','weight_reps','dumbbell','horizontal_push',false,array['Жим гантелей лежа']::text[],'Горизонтальный жим гантелей для груди с участием трицепса и передней дельты.','Опускай гантели к бокам груди и выжимай вверх, сохраняя лопатки стабильными.','Стопы устойчиво, лопатки сведены и опущены.','Плечи уходят вперёд; локти чрезмерно разведены; отрыв стоп.',array['chest']::text[],array['triceps','delts_front']::text[],array[]::text[],150),
('PUSHUP_STANDARD','Отжимания от пола','compound','bodyweight_reps','bodyweight','horizontal_push',false,array['Отжимания от пола']::text[],'Базовый жим собственным весом для груди, трицепса и передней дельты.','Опускай корпус единым блоком и выжимайся, сохраняя лопатки и таз под контролем.','Ладони чуть шире плеч, корпус прямой.','Провисание таза; локти строго в стороны; неполная амплитуда.',array['chest']::text[],array['triceps','delts_front']::text[],array['core']::text[],90),
('PUSHUP_WIDE','Отжимания с широкой постановкой рук','compound','bodyweight_reps','bodyweight','horizontal_push',false,array['Отжимания широкие','Отжимания от пола широко руки']::text[],'Вариант отжиманий с более широкой постановкой ладоней и акцентом на грудь.','Опускай грудь между ладонями, сохраняя корпус жёстким.','Ладони шире плеч без чрезмерной ширины.','Плечи у ушей; провисание таза; слишком широкий хват.',array['chest']::text[],array['triceps','delts_front']::text[],array['core']::text[],90),
('PUSHUP_NARROW','Отжимания с узкой постановкой рук','compound','bodyweight_reps','bodyweight','horizontal_push',false,array['Отжимания от пола узко руки. и попробовать на прямых руках']::text[],'Отжимания с более узкой постановкой рук и повышенной нагрузкой на трицепс.','Держи локти ближе к корпусу и выжимайся без потери линии тела.','Ладони примерно под плечами или немного уже.','Локти расходятся; провисание таза; кисти в неудобном положении.',array['triceps','chest']::text[],array['delts_front']::text[],array['core']::text[],90),
('BENCH_DIP','Обратные отжимания от лавки','compound','bodyweight_reps','bodyweight','elbow_extension',false,array['Обратные отжимания от лавки','Обратные отжимания от лавки. до сильного жжения']::text[],'Разгибание локтя с собственным весом и акцентом на трицепс.','Опускай таз рядом с лавкой и разгибай локти без сильного провала плеч вперёд.','Ладони на краю устойчивой лавки; плечи опущены.','Слишком глубокое опускание; плечи вперёд; таз далеко от лавки.',array['triceps']::text[],array['chest','delts_front']::text[],array[]::text[],90),
('CHEST_CABLE_FLY','Сведение рук в кроссовере','isolation','weight_reps','cable','chest_fly',false,array['разведение рук в кроссовере','Сведение рук в кроссовере']::text[],'Изолирующее приведение плеча с постоянным сопротивлением для грудных мышц.','Своди руки перед собой по дуге, сохраняя лёгкий фиксированный сгиб локтей.','Корпус устойчив, плечи опущены, тросы симметричны.','Жим вместо сведения; движение корпусом; чрезмерное растяжение плеча.',array['chest']::text[],array['delts_front']::text[],array[]::text[],75),
('CHEST_DB_FLY','Разведение гантелей лёжа','isolation','weight_reps','dumbbell','chest_fly',false,array['Разводы гантелей лежа']::text[],'Изолирующее сведение плеча с гантелями для груди.','Опускай руки по дуге до комфортного растяжения и своди над грудью.','Локти слегка согнуты и сохраняют угол.','Слишком глубокое опускание; превращение в жим; большой вес.',array['chest']::text[],array['delts_front']::text[],array[]::text[],90),
('CHEST_INCLINE_DB_FLY','Разведение гантелей на наклонной скамье','isolation','weight_reps','dumbbell','chest_fly',false,array['Разводы с гантелями лежа в наклоне']::text[],'Разведение гантелей на наклонной скамье с акцентом на верх груди.','Веди руки по дуге, сохраняя плечи и лопатки стабильными.','Небольшой наклон скамьи, локти мягкие.','Слишком высокий наклон; чрезмерная глубина; сгибание и разгибание локтей.',array['chest_upper']::text[],array['delts_front']::text[],array[]::text[],90),
('SHOULDER_DB_PRESS','Жим гантелей стоя','compound','weight_reps','dumbbell','vertical_push',false,array['Жим гантелей стоя']::text[],'Вертикальный жим гантелей для дельт и трицепса.','Жми гантели вверх без избыточного прогиба поясницы.','Стопы устойчиво, рёбра над тазом, гантели у плеч.','Прогиб поясницы; рёбра вверх; неполный контроль вниз.',array['delts_front']::text[],array['delts_side','triceps']::text[],array['core']::text[],120),
('SHOULDER_ARNOLD_PRESS','Жим Арнольда стоя','compound','weight_reps','dumbbell','vertical_push',false,array['Жим Арнольда стоя']::text[],'Вертикальный жим с ротацией плеча и большой амплитудой.','Начинай с гантелей перед лицом, разворачивай плечи и жми вверх плавно.','Корпус собран, вес умеренный.','Рывок; чрезмерный прогиб; болезненная ротация.',array['delts_front']::text[],array['delts_side','triceps']::text[],array['core']::text[],120),
('SHOULDER_DB_CLEAN_PRESS','Заброс и жим гантелей стоя','compound','weight_reps','dumbbell','vertical_push',false,array['Заброс + жим гантелей стоя']::text[],'Комбинированное силовое движение: подъём гантелей к плечам и вертикальный жим.','Забрось гантели к плечам контролируемым усилием и выполни жим вверх.','Стой устойчиво, корпус напряжён.','Чрезмерный рывок поясницей; потеря контроля гантелей.',array['delts_front']::text[],array['triceps','traps']::text[],array['core']::text[],150),
('SHOULDER_BB_CLEAN_PRESS','Заброс и жим штанги стоя','compound','weight_reps','barbell','vertical_push',false,array['Заброс + жим штанги стоя']::text[],'Комбинированное движение со штангой: взятие к плечам и жим над головой.','Подними штангу к плечам и выжми вверх, сохраняя контроль корпуса.','Начинай с лёгкого веса и устойчивой стойки.','Рывок поясницей; потеря траектории; слишком тяжёлый вес.',array['delts_front']::text[],array['triceps','traps','quads']::text[],array['core']::text[],180),
('DELTS_SIDE_DB_SEATED','Разведение гантелей в стороны сидя','isolation','weight_reps','dumbbell','lateral_raise',false,array['Махи в стороны сидя гантелей на плечи']::text[],'Отведение плеча сидя с уменьшенной возможностью помогать корпусом.','Поднимай гантели в стороны до комфортной высоты и медленно опускай.','Сядь устойчиво, плечи опущены.','Рывок; подъём плеч; чрезмерно тяжёлый вес.',array['delts_side']::text[],array['traps']::text[],array[]::text[],75),
('DELTS_SIDE_DB_LEAN','Разведение гантели в сторону одной рукой в наклоне','isolation','weight_reps','dumbbell','lateral_raise',true,array['Махи гантелей в стороны. ОДНОЙ РУКОЙ В НАКЛ']::text[],'Одностороннее отведение плеча с изменённой кривой нагрузки за счёт наклона корпуса.','Удерживай опору и поднимай руку в сторону без рывка.','Лёгкий наклон от опоры, плечо опущено.','Раскачка; подъём плеча; слишком большой вес.',array['delts_side']::text[],array['traps']::text[],array[]::text[],60),
('DELTS_FRONT_DB_RAISE','Подъём гантели перед собой','isolation','weight_reps','dumbbell','shoulder_flexion',false,array['Махи гантели перед собой']::text[],'Изолированное сгибание плеча с акцентом на переднюю дельту.','Поднимай гантель перед собой до уровня плеча без раскачки.','Корпус вертикален, локоть мягкий.','Рывок корпусом; подъём выше комфортной амплитуды.',array['delts_front']::text[],array['chest_upper']::text[],array[]::text[],60),
('BACK_LAT_REVERSE_PULL','Тяга верхнего блока обратным хватом к груди','compound','weight_reps','cable','vertical_pull',false,array['Вертикальная тяга обратным хватом','Вертикальная тяга к груди обратным хватом']::text[],'Вертикальная тяга обратным хватом с активным участием широчайших и бицепса.','Тяни рукоять к верхней части груди, направляя локти вниз и назад.','Хват примерно на ширине плеч, корпус почти вертикален.','Раскачка; чрезмерный наклон назад; плечи у ушей.',array['lats']::text[],array['biceps','back_mid']::text[],array[]::text[],150),
('BACK_AUSTRALIAN_PULLUP','Австралийские подтягивания','compound','bodyweight_reps','bodyweight','horizontal_pull',false,array['Австралийские подтягивания']::text[],'Горизонтальная тяга собственным весом к перекладине.','Тяни грудь к перекладине, сохраняя тело прямой линией.','Высота перекладины определяет сложность.','Провисание таза; подъём плеч; тяга только руками.',array['back_mid']::text[],array['lats','biceps']::text[],array['core']::text[],90),
('BACK_MID_DB_ROW_BILATERAL','Тяга гантелей в наклоне','compound','weight_reps','dumbbell','horizontal_pull',false,array['Тяга гантелей в наклоне']::text[],'Двусторонняя горизонтальная тяга гантелей в наклоне.','Удерживая наклон, тяни локти назад к корпусу и медленно опускай гантели.','Таз отведён назад, спина нейтральна.','Раскачка; округление спины; подъём плеч.',array['back_mid']::text[],array['lats','biceps']::text[],array['erectors','core']::text[],150),
('BACK_MID_BB_ROW','Тяга штанги в наклоне','compound','weight_reps','barbell','horizontal_pull',false,array['Тяга штанги в наклоге']::text[],'Горизонтальная тяга штанги в наклоне для середины спины и широчайших.','Тяни гриф к нижней части живота, сохраняя угол корпуса стабильным.','Таз назад, колени мягкие, спина нейтральна.','Раскачка; округление спины; изменение наклона на каждом повторе.',array['back_mid']::text[],array['lats','biceps']::text[],array['erectors','core']::text[],150),
('BACK_MID_BB_ROW_REVERSE','Тяга штанги в наклоне обратным хватом','compound','weight_reps','barbell','horizontal_pull',false,array['Тяга штанги в наклоне обратным хватом']::text[],'Тяга штанги обратным хватом с повышенным участием бицепса.','Тяни гриф к нижней части живота, удерживая локти ближе к корпусу.','Хват снизу, кисти в комфортном положении.','Раскачка; перегрузка кистей; округление спины.',array['back_mid','lats']::text[],array['biceps']::text[],array['erectors','core']::text[],150),
('BACK_MACHINE_PULLOVER','Пулловер в тренажёре','isolation','weight_reps','machine','vertical_pull',false,array['Пулловер в тренажере']::text[],'Разгибание плеча в тренажёре с акцентом на широчайшие и минимальной работой локтя.','Веди рычаг вниз за счёт плечевого сустава, сохраняя грудную клетку и таз стабильными.','Отрегулируй сиденье и ось тренажёра под плечо.','Сильное сгибание локтя; рывок; чрезмерный прогиб.',array['lats']::text[],array['chest']::text[],array[]::text[],90),
('BICEPS_DB_CURL','Подъём гантелей на бицепс стоя','isolation','weight_reps','dumbbell','elbow_flexion',false,array['Подьем гантелей на бицепс стоя']::text[],'Сгибание локтя с гантелями для бицепса.','Сгибай локти без движения плеча и медленно опускай гантели.','Корпус вертикален, локти около корпуса.','Раскачка; локти уходят вперёд; бросание веса вниз.',array['biceps']::text[],array['forearms']::text[],array[]::text[],75),
('TRICEPS_DB_SKULL_CRUSHER','Французский жим с гантелями лёжа','isolation','weight_reps','dumbbell','elbow_extension',false,array['Жим гантелей из-за головы лежа']::text[],'Разгибание локтей лёжа с гантелями для трицепса.','Сгибай локти, опуская гантели по сторонам головы, затем разгибай руки.','Плечи относительно неподвижны, хват нейтральный или комфортный.','Локти расходятся; движение плечом; чрезмерная глубина.',array['triceps']::text[],array[]::text[],array[]::text[],90),
('BACK_EXTENSION_FITBALL','Гиперэкстензия на фитболе','compound','reps_only','fitball','back_extension',false,array['Гиперэкстензия на фитболе']::text[],'Разгибание корпуса на фитболе для разгибателей спины и ягодиц.','Разгибай корпус до нейтральной линии, не переразгибая поясницу.','Таз и живот опираются на фитбол, стопы устойчиво зафиксированы.','Переразгибание; резкий подъём; движение только шеей.',array['erectors']::text[],array['glutes','hamstrings']::text[],array['core']::text[],60),
('BACK_SUPERMAN','Супермен лёжа','isolation','reps_only','bodyweight','back_extension',false,array['Супер мен']::text[],'Разгибание корпуса и конечностей лёжа для задней цепи.','Поднимай грудь и ноги умеренно, сохраняя движение плавным.','Ляг на живот, шея нейтральна.','Запрокидывание головы; чрезмерный прогиб; рывок.',array['erectors']::text[],array['glutes']::text[],array[]::text[],45),
('BACK_SWIMMING','Swimming лёжа','isolation','reps_only','bodyweight','back_extension',false,array['Свимминг','SWIMMING. по 15 в каждую сторону']::text[],'Попеременное подъём руки и противоположной ноги лёжа для задней цепи и координации.','Чередуй диагональные подъёмы без раскачки таза.','Ляг на живот, живот мягко подтянут.','Большая амплитуда за счёт поясницы; резкие махи.',array['erectors']::text[],array['glutes','delts_rear']::text[],array['core']::text[],45),
('BACK_BOAT_SCAP','Лодочка со сведением лопаток','compound','reps_only','bodyweight','back_extension',false,array['Лодочка со сведением лопаток']::text[],'Разгибание корпуса с активным сведением лопаток для разгибателей спины и верхней части спины.','Слегка подними грудь и сведи лопатки, не зажимая шею.','Ляг на живот, руки в удобном положении.','Сильный прогиб; плечи к ушам; движение только шеей.',array['erectors','back_mid']::text[],array['delts_rear']::text[],array[]::text[],45),
('CORE_PLANK','Фронтальная планка','compound','duration','bodyweight','core_anti_extension',false,array['Фронтальная планка']::text[],'Изометрическое удержание корпуса против разгибания поясницы.','Удерживай рёбра над тазом, ягодицы и пресс напряжены.','Локти под плечами, тело прямой линией.','Провисание поясницы; слишком высокий таз; задержка дыхания.',array['core']::text[],array['glutes']::text[],array['delts_front']::text[],60),
('CORE_SIDE_PLANK_DYNAMIC','Боковая планка в движении','compound','reps_only','bodyweight','core_anti_extension',true,array['Боковая планка в движении']::text[],'Динамическая боковая планка для косых мышц и боковой стабильности корпуса.','Удерживай плечо и таз в одной плоскости во время движения.','Локоть под плечом, ноги устойчиво.','Провал плеча; таз разворачивается; потеря линии корпуса.',array['obliques','core']::text[],array['glutes_medius']::text[],array[]::text[],60),
('CORE_DEAD_BUG','Мёртвый жук','isolation','reps_only','bodyweight','core_anti_extension',false,array['Мертвый жук']::text[],'Контролируемое упражнение на стабилизацию корпуса при движении рук и ног.','Сохраняй поясницу и рёбра стабильными, попеременно разгибая противоположные конечности.','Лёжа на спине, таз и рёбра в нейтральном положении.','Отрыв поясницы; слишком быстрая амплитуда; задержка дыхания.',array['core']::text[],array['hip_flexors']::text[],array[]::text[],45),
('CORE_MOUNTAIN_CLIMBER','Скалолаз / альпинист','compound','reps_only','bodyweight','core_anti_extension',false,array['Скалолаз','Альпинист']::text[],'Динамическая планка с попеременным приведением коленей, нагружающая кор и повышающая пульс.','Из планки поочерёдно веди колени вперёд, не раскачивая таз.','Ладони под плечами, корпус жёсткий.','Таз высоко; провисание поясницы; потеря опоры плеч.',array['core']::text[],array['hip_flexors','delts_front']::text[],array[]::text[],45),
('CORE_BICYCLE','Велосипед на пресс','isolation','reps_only','bodyweight','core_rotation',false,array['Велосипед']::text[],'Скручивания с попеременным приведением локтя и противоположного колена.','Поворачивай грудную клетку, а не только локоть, и разгибай свободную ногу контролируемо.','Поясница под контролем, руки не тянут шею.','Тяга головы руками; слишком быстрый темп; отрыв поясницы.',array['core','obliques']::text[],array['hip_flexors']::text[],array[]::text[],45),
('CORE_CROSS_CRUNCH','Перекрёстные скручивания','isolation','reps_only','bodyweight','core_rotation',false,array['Перекрестные скручивания','Перекресные скручивания. тут второе видео','Перекресные скручивания. Фитбол ногами держим']::text[],'Скручивание с ротацией корпуса для прямой и косых мышц живота.','Направляй плечо к противоположной стороне таза, не тяни шею.','Лёжа на спине; поясница контролируется.','Движение локтем вместо корпуса; рывок; напряжение шеи.',array['obliques','core']::text[],array[]::text[],array[]::text[],45),
('CORE_OBLIQUE_CRUNCH','Косые скручивания','isolation','reps_only','bodyweight','core_rotation',false,array['Косые скручивания']::text[],'Скручивания с акцентом на косые мышцы живота.','Скручивай грудную клетку к тазу по диагонали в небольшой контролируемой амплитуде.','Поясница стабильна, шея расслаблена.','Тяга головы; большой рывок; движение тазом.',array['obliques']::text[],array['core']::text[],array[]::text[],45),
('CORE_CRUNCH','Прямые скручивания','isolation','reps_only','bodyweight','core_flexion',false,array['Прямые скручивания']::text[],'Базовое сгибание корпуса для прямой мышцы живота.','Приближай рёбра к тазу, отрывая верх лопаток без рывка.','Поясница комфортно на полу, руки не тянут шею.','Тяга головы; полный подъём корпуса вместо скручивания.',array['core']::text[],array[]::text[],array[]::text[],45),
('CORE_V_UP','Складка / «книжка»','isolation','reps_only','bodyweight','core_flexion',false,array['Книжка','Складка']::text[],'Одновременное сближение корпуса и ног с высокой нагрузкой на пресс и сгибатели бедра.','Поднимай корпус и ноги навстречу друг другу без рывка.','Лёжа на спине, начинай с доступной амплитуды.','Рывок ногами; округление шеи; потеря контроля поясницы.',array['core']::text[],array['hip_flexors']::text[],array[]::text[],60),
('CORE_HANGING_LEG_RAISE','Подъём ног в висе','compound','reps_only','bodyweight','core_flexion',false,array['Подьем ног на турнике','Подьем ног на турнике. лямками подвязать себя']::text[],'Подъём ног в висе с нагрузкой на пресс и сгибатели бедра.','Поднимай ноги без раскачки, в верхней части подкручивай таз.','Хват или лямки надёжны, плечи активны.','Раскачка; движение только бедром; потеря контроля плеч.',array['core']::text[],array['hip_flexors','forearms']::text[],array[]::text[],75),
('CORE_LYING_LEG_RAISE','Подъём ног лёжа','isolation','reps_only','bodyweight','core_flexion',false,array['Подъем ног лежа']::text[],'Подъём ног лёжа с контролем положения таза и поясницы.','Опускай ноги только до момента, пока поясница остаётся под контролем.','Руки вдоль корпуса или под тазом при необходимости.','Прогиб поясницы; бросание ног; слишком большая амплитуда.',array['core']::text[],array['hip_flexors']::text[],array[]::text[],45),
('CORE_FITBALL_ROLLOUT','Роллаут на фитболе','compound','reps_only','fitball','core_anti_extension',false,array['Раскатка на фитболе','Роллауты на фитболе']::text[],'Антиразгибание корпуса при прокатывании предплечий по фитболу.','Удлиняй рычаг постепенно и возвращайся, не позволяя пояснице провисать.','Колени или стопы устойчиво, локти/предплечья на мяче.','Провал поясницы; движение только руками; слишком дальний роллаут.',array['core']::text[],array['lats']::text[],array['glutes']::text[],60),
('CORE_RUSSIAN_TWIST','Русский твист','isolation','reps_only','bodyweight','core_rotation',false,array['Русский твист','Русский твист. по ... в каждую сторону']::text[],'Ротационное упражнение для косых мышц живота.','Поворачивай грудную клетку из стороны в сторону, сохраняя таз стабильным.','Сядь с умеренным наклоном корпуса; стопы на полу или подняты по уровню.','Движение только руками; округление поясницы; слишком быстрый темп.',array['obliques']::text[],array['core']::text[],array[]::text[],45),
('CORE_AB_WHEEL_ROLLOUT','Роллаут с роликом для пресса','compound','reps_only','other','core_anti_extension',false,array['Скручивания с ролликом.']::text[],'Роллаут с колесом для пресса — тяжёлое упражнение на сопротивление разгибанию корпуса.','Катись вперёд только до глубины, где можешь удержать рёбра и таз под контролем.','Начинай с колен, ягодицы и пресс напряжены.','Провисание поясницы; слишком далёкий роллаут; рывок назад.',array['core']::text[],array['lats','delts_front']::text[],array[]::text[],75),
('CORE_FITBALL_PLANK','Планка с ногами на фитболе','compound','duration','fitball','core_anti_extension',false,array['Планка ноги на фитболе']::text[],'Планка с нестабильной опорой ног на фитболе.','Удерживай корпус прямым и не позволяй мячу раскачивать таз.','Голени или стопы на мяче, ладони под плечами.','Провисание поясницы; высокий таз; потеря контроля мяча.',array['core']::text[],array['delts_front']::text[],array['glutes']::text[],60),
('CORE_PLANK_SUPERMAN','Супермен в планке','compound','duration','bodyweight','core_anti_extension',true,array['Супермен в планке. по ... сек на каждую сторону']::text[],'Планка с подъёмом противоположных конечностей для анти-ротации и стабильности корпуса.','Поднимай руку и/или противоположную ногу, не разворачивая таз.','Широкая устойчивая опора, корпус жёсткий.','Разворот таза; прогиб поясницы; слишком высокая конечность.',array['core']::text[],array['glutes','erectors']::text[],array['delts_front']::text[],60),
('CARDIO_STEPPER','Степпер','cardio','duration','cardio_stepper','cardio_steady',false,array['Степпер 30 минут','Степпер или велик 30 минут. легко']::text[],'Равномерное кардио на степпере; длительность и интенсивность задаются в программе.','Держи устойчивый темп и не переноси большую часть веса на поручни.','Выбери сопротивление, позволяющее сохранять технику и целевую интенсивность.','Сильная опора руками; слишком короткий шаг; темп выше целевого.',array['quads','glutes']::text[],array['calves']::text[],array[]::text[],30),
('CARDIO_BIKE','Велотренажёр','cardio','duration','stationary_bike','cardio_steady',false,array['Велик 30 минут легко']::text[],'Равномерное кардио на велотренажёре; время и интенсивность задаются в тренировке.','Крути педали плавно с устойчивым каденсом.','Высота седла позволяет почти полностью разгибать колено без раскачки таза.','Слишком низкое седло; раскачка таза; чрезмерное сопротивление.',array['quads']::text[],array['glutes','calves']::text[],array[]::text[],30),
('CARDIO_BIKE_INTERVAL','Интервалы на велотренажёре','cardio','duration','stationary_bike','cardio_interval',false,array['20 секунд легко крутим педали - 20 - на полную катушку. 8 кругов']::text[],'Интервальное кардио на велосипеде; интервалы работы и восстановления задаются программой.','Чередуй рабочие и восстановительные интервалы, сохраняя безопасный контроль техники.','Седло настроено, сопротивление позволяет ускоряться без потери позиции.','Слишком тяжёлое сопротивление; потеря контроля корпуса; отсутствие восстановления.',array['quads']::text[],array['glutes','calves']::text[],array[]::text[],30);

insert into public.exercises(
  code,name,exercise_type,tracking_type,equipment_code,movement_pattern_code,is_unilateral,
  aliases,description,instructions,setup_notes,common_mistakes,default_rest_seconds,
  mechanics,is_active,updated_at
)
select
  code,name,exercise_type,tracking_type,equipment_code,movement_pattern_code,is_unilateral,
  aliases,description,instructions,setup_notes,common_mistakes,default_rest_seconds,
  case when exercise_type in ('compound','isolation') then exercise_type else null end,
  true,now()
from tmp_exercise_seed
on conflict(code) do update set
  name=excluded.name,
  exercise_type=excluded.exercise_type,
  tracking_type=excluded.tracking_type,
  equipment_code=coalesce(excluded.equipment_code,public.exercises.equipment_code),
  movement_pattern_code=coalesce(excluded.movement_pattern_code,public.exercises.movement_pattern_code),
  is_unilateral=excluded.is_unilateral,
  aliases=(select coalesce(array_agg(distinct v order by v),'{}'::text[])
           from unnest(coalesce(public.exercises.aliases,'{}'::text[]) || coalesce(excluded.aliases,'{}'::text[])) v
           where btrim(v)<>''),
  description=coalesce(public.exercises.description,excluded.description),
  instructions=coalesce(public.exercises.instructions,excluded.instructions),
  setup_notes=coalesce(public.exercises.setup_notes,excluded.setup_notes),
  common_mistakes=coalesce(public.exercises.common_mistakes,excluded.common_mistakes),
  default_rest_seconds=excluded.default_rest_seconds,
  mechanics=case when excluded.exercise_type in ('compound','isolation') then excluded.exercise_type else null end,
  updated_at=now();

delete from public.exercise_muscle_groups emg
using public.exercises e, tmp_exercise_seed s
where e.code=s.code and emg.exercise_id=e.id;

insert into public.exercise_muscle_groups(exercise_id,muscle_group_code,role)
select e.id, m.code, 'primary'
from tmp_exercise_seed s
join public.exercises e on e.code=s.code
cross join lateral unnest(coalesce(s.primary_codes,'{}'::text[])) m(code)
on conflict(exercise_id,muscle_group_code) do update set role='primary';

insert into public.exercise_muscle_groups(exercise_id,muscle_group_code,role)
select e.id, m.code, 'secondary'
from tmp_exercise_seed s
join public.exercises e on e.code=s.code
cross join lateral unnest(coalesce(s.secondary_codes,'{}'::text[])) m(code)
where not (m.code=any(coalesce(s.primary_codes,'{}'::text[])))
on conflict(exercise_id,muscle_group_code) do update set role='secondary';

insert into public.exercise_muscle_groups(exercise_id,muscle_group_code,role)
select e.id, m.code, 'stabilizer'
from tmp_exercise_seed s
join public.exercises e on e.code=s.code
cross join lateral unnest(coalesce(s.stabilizer_codes,'{}'::text[])) m(code)
where not (m.code=any(coalesce(s.primary_codes,'{}'::text[])))
  and not (m.code=any(coalesce(s.secondary_codes,'{}'::text[])))
on conflict(exercise_id,muscle_group_code) do update set role='stabilizer';

-- Replacement groups for imported Google Sheet logic.
insert into public.exercise_substitution_groups(code,name,purpose,scope)
select v.code,v.name,v.purpose,v.scope
from (values
  ('CHEST_FLAT_PRESS','Горизонтальные жимы на грудь','Взаимозаменяемые горизонтальные жимы и отжимания','specific'),
  ('CHEST_FLY','Сведения / разводки на грудь','Изолирующие варианты сведения плеча для груди','specific'),
  ('SHOULDER_PRESS','Вертикальные жимы','Базовые жимы над головой','specific'),
  ('GLUTE_HIP_THRUST','Ягодичные мосты / hip thrust','Варианты разгибания таза с акцентом на ягодицы','specific'),
  ('GLUTE_HIP_ABDUCTION','Отведения бедра','Варианты нагрузки средней ягодичной через отведение бедра','specific'),
  ('GLUTE_HIP_EXTENSION','Разгибание бедра на ягодицы','Односторонние изолирующие разгибания бедра','specific'),
  ('LUNGE_SPLIT','Выпады и сплит-приседы','Односторонние коленно-доминантные упражнения','specific'),
  ('HINGE_RDL','Румынские тяги / тазовый шарнир','Варианты тазового шарнира для ягодиц и задней поверхности бедра','specific'),
  ('CORE_CRUNCHES','Скручивания','Варианты сгибания и диагонального сгибания корпуса','broad'),
  ('CORE_ROLLOUT','Роллауты / антиразгибание','Динамические упражнения на сопротивление разгибанию корпуса','specific'),
  ('CORE_PLANKS','Планки / стабилизация','Изометрические и динамические варианты стабилизации корпуса','broad'),
  ('CARDIO_EASY','Равномерное кардио','Кардио низкой или умеренной интенсивности по времени','broad'),
  ('CARDIO_INTERVAL','Интервальное кардио','Кардио с чередованием рабочих и восстановительных интервалов','broad')
) as v(code,name,purpose,scope)
where not exists(select 1 from public.exercise_substitution_groups g where g.code=v.code);

create temporary table tmp_replacement_seed(
  group_code text, exercise_code text, priority integer, match_type text, is_default boolean, notes text
) on commit drop;

insert into tmp_replacement_seed values
('BACK_HORIZONTAL_ROW','BACK_MID_CABLE_ROW',10,'direct',true,null),
('BACK_HORIZONTAL_ROW','BACK_MID_DB_ROW',20,'direct',false,null),
('BACK_HORIZONTAL_ROW','BACK_MID_DB_ROW_BILATERAL',30,'direct',false,null),
('BACK_HORIZONTAL_ROW','BACK_MID_BB_ROW',40,'direct',false,null),
('BACK_HORIZONTAL_ROW','BACK_MID_BB_ROW_REVERSE',50,'acceptable',false,'Обратный хват сильнее вовлекает бицепс'),
('BACK_HORIZONTAL_ROW','BACK_AUSTRALIAN_PULLUP',60,'acceptable',false,'Собственный вес вместо внешнего отягощения'),

('BACK_VERTICAL_PULL','BACK_LAT_NEUTRAL_PULL',10,'direct',true,null),
('BACK_VERTICAL_PULL','BACK_LAT_NEUTRAL_PULLUP',20,'direct',false,null),
('BACK_VERTICAL_PULL','BACK_LAT_WIDE_PULL',30,'acceptable',false,'Другой хват и механика плеча'),
('BACK_VERTICAL_PULL','BACK_LAT_REVERSE_PULL',40,'acceptable',false,'Обратный хват сильнее вовлекает бицепс'),
('BACK_VERTICAL_PULL','BACK_MACHINE_PULLOVER',90,'fallback',false,'Широчайшие сохраняются, но движение становится почти односуставным'),

('CHEST_FLAT_PRESS','CHEST_DB_PRESS',10,'direct',true,null),
('CHEST_FLAT_PRESS','PUSHUP_STANDARD',20,'direct',false,'Собственный вес'),
('CHEST_FLAT_PRESS','PUSHUP_WIDE',30,'acceptable',false,'Шире постановка рук'),
('CHEST_FLAT_PRESS','PUSHUP_NARROW',60,'fallback',false,'Сильнее смещает нагрузку на трицепс'),

('CHEST_FLY','CHEST_CABLE_FLY',10,'direct',true,null),
('CHEST_FLY','CHEST_DB_FLY',20,'direct',false,null),
('CHEST_FLY','CHEST_INCLINE_DB_FLY',30,'acceptable',false,'Больше акцент на верх груди'),

('SHOULDER_PRESS','SHOULDER_DB_PRESS',10,'direct',true,null),
('SHOULDER_PRESS','SHOULDER_ARNOLD_PRESS',20,'acceptable',false,'Добавляет ротацию плеча'),
('SHOULDER_PRESS','SHOULDER_DB_CLEAN_PRESS',50,'fallback',false,'Комбинированное движение с забросом'),
('SHOULDER_PRESS','SHOULDER_BB_CLEAN_PRESS',60,'fallback',false,'Комбинированное движение со штангой'),

('DELTS_SIDE_RAISE','DELTS_SIDE_CABLE_RAISE',10,'direct',true,null),
('DELTS_SIDE_RAISE','DELTS_SIDE_DB_RAISE',20,'direct',false,null),
('DELTS_SIDE_RAISE','DELTS_SIDE_DB_SEATED',30,'direct',false,'Меньше читинга корпусом'),
('DELTS_SIDE_RAISE','DELTS_SIDE_DB_LEAN',40,'acceptable',false,'Изменённая кривая нагрузки'),
('DELTS_SIDE_RAISE','DELTS_SIDE_MACHINE_RAISE',50,'direct',false,null),

('GLUTE_HIP_THRUST','GLUTE_HIP_THRUST_BB',10,'direct',true,null),
('GLUTE_HIP_THRUST','GLUTE_HIP_THRUST_SMITH',20,'direct',false,'Фиксированная траектория'),
('GLUTE_HIP_THRUST','GLUTE_BRIDGE_WEIGHTED',30,'acceptable',false,'Меньшая амплитуда с пола'),
('GLUTE_HIP_THRUST','GLUTE_SINGLE_LEG_BRIDGE',40,'acceptable',false,'Односторонний вариант'),
('GLUTE_HIP_THRUST','GLUTE_BAND_BRIDGE',50,'fallback',false,'Лёгкий вариант с резинкой'),
('GLUTE_HIP_THRUST','GLUTE_FROG_PUMP',60,'fallback',false,'Локальный высокоповторный вариант'),

('GLUTE_HIP_ABDUCTION','HIP_ABD_CABLE',10,'direct',true,null),
('GLUTE_HIP_ABDUCTION','HIP_ABD_BAND_STANDING',20,'direct',false,null),
('GLUTE_HIP_ABDUCTION','HIP_ABD_BAND_SEATED',30,'direct',false,null),
('GLUTE_HIP_ABDUCTION','BAND_CRAB_WALK',40,'acceptable',false,'Динамический вариант в ходьбе'),

('GLUTE_HIP_EXTENSION','GLUTE_KICKBACK_CABLE',10,'direct',true,null),
('GLUTE_HIP_EXTENSION','GLUTE_SINGLE_LEG_BRIDGE',80,'fallback',false,'Сохраняет разгибание бедра, но становится базовым движением'),

('LUNGE_SPLIT','QUAD_GLUTE_BULGARIAN_SPLIT',10,'direct',true,null),
('LUNGE_SPLIT','LUNGE_STATIONARY_DB',20,'direct',false,null),
('LUNGE_SPLIT','LUNGE_GOBLET',30,'direct',false,null),
('LUNGE_SPLIT','LUNGE_WALKING_DB',40,'acceptable',false,'Динамический вариант'),
('LUNGE_SPLIT','STEP_UP_DB',50,'acceptable',false,'Зашагивание вместо выпада'),
('LUNGE_SPLIT','LEG_PRESS_SINGLE',80,'fallback',false,'Односторонняя нагрузка без требований к балансу'),

('QUAD_GLUTE_KNEE_DOMINANT','QUAD_GLUTE_LEG_PRESS',10,'direct',true,null),
('QUAD_GLUTE_KNEE_DOMINANT','QUAD_GLUTE_HACK_SQUAT',20,'direct',false,null),
('QUAD_GLUTE_KNEE_DOMINANT','LEG_PRESS_HIGH_FEET',25,'direct',false,'Выше постановка стоп'),
('QUAD_GLUTE_KNEE_DOMINANT','SUMO_GOBLET_SQUAT',30,'acceptable',false,'Свободный вес и широкая стойка'),
('QUAD_GLUTE_KNEE_DOMINANT','SUMO_BB_SQUAT',40,'acceptable',false,'Штанга и широкая стойка'),
('QUAD_GLUTE_KNEE_DOMINANT','QUAD_GLUTE_BULGARIAN_SPLIT',50,'acceptable',false,'Односторонний вариант'),

('HINGE_RDL','RDL_BB',10,'direct',true,null),
('HINGE_RDL','HAMSTRING_RDL_DB',20,'direct',false,'Гантели вместо штанги'),
('HINGE_RDL','RDL_SINGLE_DB',30,'acceptable',false,'Односторонний вариант'),
('HINGE_RDL','SINGLE_LEG_HINGE_BW',60,'fallback',false,'Технический вариант без веса'),
('HINGE_RDL','DEADLIFT_BB',90,'fallback',false,'Тяга с пола, другая механика и вклад колена'),

('TRICEPS_EXTENSION','TRICEPS_CABLE_PUSHDOWN',10,'direct',true,null),
('TRICEPS_EXTENSION','TRICEPS_OVERHEAD_ROPE_EXT',20,'acceptable',false,'Больше длинная головка в растяжении'),
('TRICEPS_EXTENSION','TRICEPS_FRENCH_DB',30,'acceptable',false,null),
('TRICEPS_EXTENSION','TRICEPS_DB_SKULL_CRUSHER',40,'acceptable',false,null),
('TRICEPS_EXTENSION','BENCH_DIP',80,'fallback',false,'Базовое движение с собственным весом'),

('CORE_CRUNCHES','CORE_CRUNCH',10,'direct',true,null),
('CORE_CRUNCHES','CORE_CROSS_CRUNCH',20,'acceptable',false,'Добавляется ротация'),
('CORE_CRUNCHES','CORE_OBLIQUE_CRUNCH',30,'acceptable',false,'Акцент на косые'),
('CORE_CRUNCHES','CORE_BICYCLE',40,'acceptable',false,'Динамический вариант с ногами'),
('CORE_CRUNCHES','CORE_V_UP',60,'fallback',false,'Сильнее вовлекаются сгибатели бедра'),

('CORE_ROLLOUT','CORE_FITBALL_ROLLOUT',10,'direct',true,null),
('CORE_ROLLOUT','CORE_AB_WHEEL_ROLLOUT',20,'direct',false,'Более тяжёлый вариант с роликом'),
('CORE_ROLLOUT','CORE_DEAD_BUG',80,'fallback',false,'Облегчённое антиразгибание'),

('CORE_PLANKS','CORE_PLANK',10,'direct',true,null),
('CORE_PLANKS','CORE_FITBALL_PLANK',20,'acceptable',false,'Нестабильная опора'),
('CORE_PLANKS','CORE_SIDE_PLANK_DYNAMIC',30,'acceptable',false,'Боковая стабильность'),
('CORE_PLANKS','CORE_PLANK_SUPERMAN',40,'acceptable',false,'Анти-ротация с подъёмом конечностей'),
('CORE_PLANKS','CORE_MOUNTAIN_CLIMBER',60,'fallback',false,'Динамический вариант'),

('CARDIO_EASY','CARDIO_STEPPER',10,'direct',true,null),
('CARDIO_EASY','CARDIO_BIKE',20,'direct',false,null),
('CARDIO_INTERVAL','CARDIO_BIKE_INTERVAL',10,'direct',true,null);

insert into public.exercise_substitution_members(group_id,exercise_id,priority,is_default,match_type,notes)
select g.id,e.id,s.priority,s.is_default,s.match_type,s.notes
from tmp_replacement_seed s
join public.exercise_substitution_groups g on g.code=s.group_code
join public.exercises e on e.code=s.exercise_code
on conflict(group_id,exercise_id) do update set
  priority=excluded.priority,
  is_default=excluded.is_default,
  match_type=excluded.match_type,
  notes=excluded.notes;
