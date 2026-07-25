// src/commands/Economy/farm.js
//
// ============================================================================
// لعبة "إمبراطورية المزرعة الاقتصادية" — النسخة المطوّرة v3
// لوحة تحكم واحدة (Embed غني + قائمة اختيار + أزرار) + نظام مستويات يفتح
// تدريجياً المحاصيل/الحيوانات/المصانع/الأراضي/العقارات/العمال.
// العملة = wallet الحقيقي في نظام الإيكونومي عندكم (EconomyService).
// ============================================================================
//
// ---------------------------------------------------------------------------
// 🖼️ عن الصور: كيف تضيفها
// ---------------------------------------------------------------------------
// أنشئ مجلد "assets/farm" في جذر مشروعك (بجانب مجلد src)، وحط بداخله صور
// PNG/JPG بنفس هالأسماء بالضبط (المقاس المقترح: 900×300 تقريباً، أفقي):
//
//   assets/farm/main.png        (اللوحة الرئيسية)
//   assets/farm/crops.png       (قسم المحاصيل)
//   assets/farm/animals.png     (قسم الحيوانات)
//   assets/farm/factories.png   (قسم المصانع)
//   assets/farm/realestate.png  (قسم العقارات)
//   assets/farm/workers.png     (قسم العمال)
//   assets/farm/inventory.png   (قسم المخزون)
//   assets/farm/market.png      (قسم السوق والطقس)
//   assets/farm/help.png        (كتيب التعليمات)
//
// الكود يتحقق تلقائياً هل الملف موجود؛ لو ما رفعت صورة معينة، القسم يشتغل
// عادي بدون صورة (ما يصير أي خطأ أو كراش). تقدر تجيب صور مجانية بدون
// حقوق ملكية من مواقع مثل Unsplash أو Pixabay وتسميها بهالأسماء بالضبط.
// ---------------------------------------------------------------------------

import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import EconomyService from '../../services/economyService.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, '../../../assets/farm');

const EMBED_COLOR = 0x1b5e20;
const LEVEL_UP_BASE = 200;
const SESSION_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// بيانات اللعبة (كل عنصر فيه unlockLevel = المستوى المطلوب لفتحه)
// ---------------------------------------------------------------------------
const CROPS = {
  wheat: { label: 'قمح', emoji: '🌾', growSeconds: 60, cost: 10, sell: 18, unlockLevel: 1 },
  carrot: { label: 'جزر', emoji: '🥕', growSeconds: 40, cost: 7, sell: 12, unlockLevel: 1 },
  beans: { label: 'فاصوليا', emoji: '🫘', growSeconds: 45, cost: 8, sell: 14, unlockLevel: 2 },
  corn: { label: 'ذرة', emoji: '🌽', growSeconds: 90, cost: 15, sell: 26, unlockLevel: 3 },
  strawberry: { label: 'فراولة', emoji: '🍓', growSeconds: 120, cost: 25, sell: 45, unlockLevel: 5 },
  grapes: { label: 'عنب', emoji: '🍇', growSeconds: 150, cost: 30, sell: 55, unlockLevel: 8 }
};

const ANIMALS = {
  chicken: { label: 'دجاجة', emoji: '🐔', cost: 80, product: 'eggs', produceSeconds: 180, unlockLevel: 1 },
  sheep: { label: 'خروف', emoji: '🐑', cost: 150, product: 'wool', produceSeconds: 420, unlockLevel: 3 },
  cow: { label: 'بقرة', emoji: '🐄', cost: 200, product: 'milk', produceSeconds: 300, unlockLevel: 5 },
  beehive: { label: 'خلية نحل', emoji: '🐝', cost: 220, product: 'honey', produceSeconds: 360, unlockLevel: 7 }
};

const RAW_PRODUCTS = {
  milk: { label: 'حليب', emoji: '🥛', sell: 12 },
  eggs: { label: 'بيض', emoji: '🥚', sell: 8 },
  wool: { label: 'صوف', emoji: '🧶', sell: 20 },
  honey: { label: 'عسل', emoji: '🍯', sell: 25 }
};

const FACTORIES = {
  bakery: { label: 'مخبز', emoji: '🍞', cost: 500, recipe: { wheat: 3 }, output: 'bread', outputLabel: 'خبز', outputEmoji: '🥖', outputSell: 30, unlockLevel: 4 },
  dairy: { label: 'معمل ألبان', emoji: '🧀', cost: 600, recipe: { milk: 3 }, output: 'cheese', outputLabel: 'جبن', outputEmoji: '🧀', outputSell: 40, unlockLevel: 6 },
  juice_press: { label: 'معصرة عصائر', emoji: '🧃', cost: 550, recipe: { grapes: 2, strawberry: 2 }, output: 'juice', outputLabel: 'عصير', outputEmoji: '🧃', outputSell: 50, unlockLevel: 8 },
  textile: { label: 'مصنع نسيج', emoji: '🧵', cost: 700, recipe: { wool: 4 }, output: 'cloth', outputLabel: 'قماش', outputEmoji: '🧶', outputSell: 60, unlockLevel: 10 }
};

const REAL_ESTATE = {
  silo: { label: 'صومعة الغلال', emoji: '🏚️', cost: 1000, effect: 'زيادة سعة تخزين المحاصيل بشكل كبير', unlockLevel: 5 },
  farmshop: { label: 'سوق المزرعة', emoji: '🏪', cost: 1500, effect: 'زيادة سعر بيع كل المنتجات 10%', unlockLevel: 8 },
  solar_plant: { label: 'محطة الطاقة الشمسية', emoji: '☀️', cost: 3000, effect: 'تخفيض تكلفة تشغيل المصانع 20%', unlockLevel: 12 },
  palace: { label: 'القصر الرئيسي', emoji: '🏰', cost: 5000, effect: 'مكانة رفيعة ودخل يومي إضافي', unlockLevel: 20 }
};

const WORKERS = {
  guard_dog: { label: 'حارس المزرعة', emoji: '🐕', cost: 300, effect: 'حماية المزرعة من السرقة', unlockLevel: 3 },
  truck_driver: { label: 'سائق الشاحنة', emoji: '🚚', cost: 600, effect: 'بيع تلقائي للمخزون الفائض', unlockLevel: 7 },
  auto_harvester: { label: 'الحاصد الآلي', emoji: '🤖', cost: 800, effect: 'حصاد تلقائي دوري لكل حقولك', unlockLevel: 10 }
};

const WEATHER_TYPES = [
  { name: '☀️ مشمس', desc: 'أجواء صافية ومثالية للزراعة', yieldMult: 1.15 },
  { name: '⛅ غائم', desc: 'أجواء معتدلة، نمو طبيعي', yieldMult: 1.0 },
  { name: '🌧️ ممطر', desc: 'أمطار غزيرة تسرّع نمو المحاصيل', yieldMult: 1.25 },
  { name: '🌵 جفاف', desc: 'موجة جفاف تبطئ نمو المحاصيل', yieldMult: 0.7 },
  { name: '❄️ صقيع', desc: 'برد قارس يضر بالمحاصيل الحساسة', yieldMult: 0.5 }
];

let marketState = { multiplier: 1.0, lastUpdate: 0 };

function getCurrentWeather() {
  return WEATHER_TYPES[Math.floor(Math.random() * WEATHER_TYPES.length)];
}

function getMarketMultiplier() {
  const now = Date.now();
  if (now - marketState.lastUpdate > 5 * 60 * 1000) {
    marketState.multiplier = Math.round((0.8 + Math.random() * 0.6) * 100) / 100;
    marketState.lastUpdate = now;
  }
  return marketState.multiplier;
}

// ---------------------------------------------------------------------------
// نظام المستويات: عدد الأراضي المتاحة يزيد مع المستوى
// ---------------------------------------------------------------------------
function maxPlots(level) {
  return Math.min(2 + level, 15);
}

function levelTitle(level) {
  if (level >= 20) return '👑 إمبراطور المزارع';
  if (level >= 12) return '🏆 بارون زراعي';
  if (level >= 8) return '🌟 مزارع محترف';
  if (level >= 4) return '🚜 مزارع نشيط';
  return '🌱 مزارع مبتدئ';
}

function isUnlocked(farm, def) {
  return farm.level >= (def.unlockLevel || 1);
}

function lockNote(def) {
  return `🔒 يفتح عند المستوى **${def.unlockLevel}**`;
}

// ---------------------------------------------------------------------------
// حالة المزرعة (مخزّنة داخل بيانات الإيكونومي الحقيقية تحت حقل farm)
// ---------------------------------------------------------------------------
function getFarmState(userData) {
  if (!userData.farm || typeof userData.farm !== 'object') {
    userData.farm = { level: 1, exp: 0, inventory: {}, plots: [], animals: {}, buildings: [], workers: [] };
  }
  const f = userData.farm;
  if (!Array.isArray(f.plots)) f.plots = [];
  if (!f.animals || typeof f.animals !== 'object') f.animals = {};
  if (!f.inventory || typeof f.inventory !== 'object') f.inventory = {};
  if (!Array.isArray(f.buildings)) f.buildings = [];
  if (!Array.isArray(f.workers)) f.workers = [];
  if (!Number.isFinite(f.level)) f.level = 1;
  if (!Number.isFinite(f.exp)) f.exp = 0;
  return f;
}

function addFarmExp(farm, amount) {
  farm.exp += amount;
  let leveledUp = false;
  let threshold = farm.level * LEVEL_UP_BASE;
  while (farm.exp >= threshold) {
    farm.exp -= threshold;
    farm.level += 1;
    leveledUp = true;
    threshold = farm.level * LEVEL_UP_BASE;
  }
  return leveledUp;
}

function addItem(farm, item, qty) {
  farm.inventory[item] = (farm.inventory[item] || 0) + qty;
}

function removeItem(farm, item, qty) {
  if ((farm.inventory[item] || 0) < qty) return false;
  farm.inventory[item] -= qty;
  if (farm.inventory[item] <= 0) delete farm.inventory[item];
  return true;
}

function itemLabel(item) {
  if (CROPS[item]) return CROPS[item].label;
  if (RAW_PRODUCTS[item]) return RAW_PRODUCTS[item].label;
  const f = Object.values(FACTORIES).find((x) => x.output === item);
  if (f) return f.outputLabel;
  return item;
}

function itemEmoji(item) {
  if (CROPS[item]) return CROPS[item].emoji;
  if (RAW_PRODUCTS[item]) return RAW_PRODUCTS[item].emoji;
  const f = Object.values(FACTORIES).find((x) => x.output === item);
  if (f) return f.outputEmoji;
  return '📦';
}

function sellPrice(item) {
  if (CROPS[item]) return CROPS[item].sell;
  if (RAW_PRODUCTS[item]) return RAW_PRODUCTS[item].sell;
  const factory = Object.values(FACTORIES).find((f) => f.output === item);
  if (factory) return factory.outputSell;
  return null;
}

function money(n) {
  const v = Number(n);
  return `$${(Number.isFinite(v) ? v : 0).toLocaleString()}`;
}

function errMsg(error) {
  return error?.userMessage || error?.message || 'حدث خطأ غير متوقع، حاول مرة ثانية.';
}

async function loadFarm(client, guildId, userId) {
  const userData = await getEconomyData(client, guildId, userId);
  const farm = getFarmState(userData);
  return { userData, farm };
}

// ---------------------------------------------------------------------------
// الصور — تُرفق فقط لو الملف موجود فعلياً، وإلا يتجاهلها الكود بأمان
// ---------------------------------------------------------------------------
function sectionImage(name) {
  try {
    const file = path.join(ASSETS_DIR, `${name}.png`);
    if (fs.existsSync(file)) {
      return { attachment: new AttachmentBuilder(file, { name: `${name}.png` }), url: `attachment://${name}.png` };
    }
  } catch (_) {
    /* تجاهل أي خطأ في نظام الملفات ولا نكسر اللعبة بسببه */
  }
  return null;
}

function withImage(embed, payload, name) {
  const img = sectionImage(name);
  if (img) {
    embed.setImage(img.url);
    payload.files = [img.attachment];
  }
  return payload;
}

// ---------------------------------------------------------------------------
// أزرار مشتركة
// ---------------------------------------------------------------------------
function backRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('farm_back').setLabel('⬅️ رجوع للقائمة الرئيسية').setStyle(ButtonStyle.Secondary)
  );
}

function mainMenuRow() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('farm_menu')
    .setPlaceholder('🧭 اختر قسماً لإدارته...')
    .addOptions(
      { label: 'المحاصيل', value: 'crops', emoji: '🌱', description: 'ازرع واحصد محاصيلك الخاصة' },
      { label: 'الحيوانات', value: 'animals', emoji: '🐄', description: 'اقتنِ حيوانات واجمع منتجاتها' },
      { label: 'المصانع', value: 'factories', emoji: '🏭', description: 'حوّل موادك الخام لمنتجات ثمينة' },
      { label: 'العقارات', value: 'realestate', emoji: '🏛️', description: 'أصول استراتيجية دائمة لمزرعتك' },
      { label: 'العمال', value: 'workers', emoji: '👷', description: 'وظّف طاقماً لأتمتة وحماية مزرعتك' },
      { label: 'المخزون والبيع', value: 'inventory', emoji: '📦', description: 'راجع مخزونك وبِع منتجاتك' },
      { label: 'السوق والطقس', value: 'market', emoji: '📊', description: 'راقب الأسعار والطقس اللحظي' },
      { label: 'كتيب التعليمات', value: 'help', emoji: '📖', description: 'دليل شامل لكل أنظمة اللعبة' }
    );
  return new ActionRowBuilder().addComponents(menu);
}

// ---------------------------------------------------------------------------
// عرض الأقسام
// ---------------------------------------------------------------------------
function renderMain(farm, userData) {
  const weather = getCurrentWeather();
  const market = getMarketMultiplier();
  const plotsUsed = farm.plots.length;
  const plotsMax = maxPlots(farm.level);
  const expBar = `${farm.exp} / ${farm.level * LEVEL_UP_BASE} ✨`;

  const embed = new EmbedBuilder()
    .setTitle('🌾🚜 إمبراطورية المزرعة الاقتصادية 🚜🌾')
    .setDescription(
      `مرحباً بك في مزرعتك 🌻\n` +
        `من هنا تدير كل شؤون إمبراطوريتك الزراعية — من زراعة أول بذرة إلى بناء مصانع ضخمة وتوظيف طاقم كامل.\n\n` +
        `اختر قسماً من القائمة تحت 👇 لتبدأ الإدارة.`
    )
    .setColor(EMBED_COLOR)
    .addFields(
      { name: '🏅 اللقب', value: levelTitle(farm.level), inline: true },
      { name: '📶 المستوى', value: `**${farm.level}**`, inline: true },
      { name: '✨ الخبرة', value: expBar, inline: true },
      { name: '💵 الرصيد', value: money(userData.wallet), inline: true },
      { name: '🌦️ الطقس الحالي', value: `${weather.name}\n_${weather.desc}_`, inline: true },
      { name: '📈 مضاعف السوق', value: `x${market}` + (market > 1.2 ? ' 📈 طفرة شرائية!' : ''), inline: true },
      { name: '🗺️ الأراضي المستخدمة', value: `${plotsUsed} / ${plotsMax}`, inline: true },
      { name: '🐄 الحيوانات المملوكة', value: String(Object.values(farm.animals).reduce((a, e) => a + (e.count || 0), 0)), inline: true },
      { name: '🏗️ المباني المشيّدة', value: String(farm.buildings.length + farm.workers.length), inline: true }
    )
    .setFooter({ text: '💡 نصيحة: افتح "كتيب التعليمات" من القائمة لتعرف كل شي بالتفصيل. تُغلق اللوحة تلقائياً بعد 10 دقائق خمول.' });

  const payload = { embeds: [embed], components: [mainMenuRow()] };
  return withImage(embed, payload, 'main');
}

function renderCrops(farm) {
  const plotsUsed = farm.plots.length;
  const plotsMax = maxPlots(farm.level);

  const embed = new EmbedBuilder()
    .setTitle('🌱🌾 قسم المحاصيل 🌾🌱')
    .setColor(EMBED_COLOR)
    .setDescription(
      `ازرع بذورك واصبر عليها حتى تنضج، ثم احصدها لتحصل على محاصيل تبيعها أو تصنّعها لاحقاً.\n\n` +
        `🗺️ **الأراضي المستخدمة:** ${plotsUsed} / ${plotsMax} ` +
        (plotsUsed >= plotsMax ? '⚠️ (وصلت للحد الأقصى، ارفع مستواك لزيادة المساحة)' : '')
    )
    .addFields(
      Object.entries(CROPS).map(([, c]) => {
        const locked = farm.level < c.unlockLevel;
        return {
          name: `${c.emoji} ${c.label}` + (locked ? ' 🔒' : ''),
          value: locked
            ? lockNote(c)
            : `💰 التكلفة: ${money(c.cost)}\n💵 سعر البيع: ${money(c.sell)}\n⏱️ وقت النمو: ~${c.growSeconds} ثانية`,
          inline: true
        };
      })
    );

  if (plotsUsed > 0) {
    embed.addFields({ name: '📋 حقولك الحالية', value: `لديك ${plotsUsed} حقل مزروع الآن — استخدم زر "حصاد الكل" لجمعها عند اكتمال نموها.` });
  }

  const cropEntries = Object.entries(CROPS);
  const makeBtn = ([key, c]) => {
    const locked = !isUnlocked(farm, c);
    return new ButtonBuilder()
      .setCustomId(`farm_plant_${key}`)
      .setLabel(locked ? `🔒 ${c.label}` : c.label)
      .setEmoji(c.emoji)
      .setStyle(ButtonStyle.Success)
      .setDisabled(locked || plotsUsed >= plotsMax);
  };
  const row1 = new ActionRowBuilder().addComponents(cropEntries.slice(0, 5).map(makeBtn));
  const row2 = new ActionRowBuilder().addComponents(cropEntries.slice(5).map(makeBtn));
  row2.addComponents(new ButtonBuilder().setCustomId('farm_harvest').setLabel('حصاد الكل').setEmoji('🌾').setStyle(ButtonStyle.Primary));
  row2.addComponents(new ButtonBuilder().setCustomId('farm_back').setLabel('رجوع').setStyle(ButtonStyle.Secondary));

  const payload = { embeds: [embed], components: [row1, row2] };
  return withImage(embed, payload, 'crops');
}

function renderAnimals(farm) {
  const embed = new EmbedBuilder()
    .setTitle('🐄🐔 قسم الحيوانات 🐔🐄')
    .setColor(EMBED_COLOR)
    .setDescription('اقتنِ حيوانات لمزرعتك، وهي تنتج لك مواد خام تلقائياً كل فترة زمنية — لا تنسَ تجمعها بانتظام!')
    .addFields(
      Object.entries(ANIMALS).map(([key, a]) => {
        const locked = farm.level < a.unlockLevel;
        const owned = farm.animals[key]?.count || 0;
        return {
          name: `${a.emoji} ${a.label}` + (locked ? ' 🔒' : ''),
          value: locked
            ? lockNote(a)
            : `💰 التكلفة: ${money(a.cost)}\n📦 ينتج: ${RAW_PRODUCTS[a.product].emoji} ${RAW_PRODUCTS[a.product].label} كل ${a.produceSeconds} ثانية\n🔢 تملك حالياً: **${owned}**`,
          inline: true
        };
      })
    );

  const animalEntries = Object.entries(ANIMALS);
  const row1 = new ActionRowBuilder().addComponents(
    animalEntries.map(([key, a]) => {
      const locked = !isUnlocked(farm, a);
      return new ButtonBuilder()
        .setCustomId(`farm_buyanimal_${key}`)
        .setLabel(locked ? `🔒 ${a.label}` : a.label)
        .setEmoji(a.emoji)
        .setStyle(ButtonStyle.Success)
        .setDisabled(locked);
    })
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('farm_collect').setLabel('جمع المنتجات').setEmoji('🧺').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('farm_back').setLabel('رجوع').setStyle(ButtonStyle.Secondary)
  );

  const payload = { embeds: [embed], components: [row1, row2] };
  return withImage(embed, payload, 'animals');
}

function renderFactories(farm) {
  const embed = new EmbedBuilder()
    .setTitle('🏭⚙️ قسم المصانع ⚙️🏭')
    .setColor(EMBED_COLOR)
    .setDescription('حوّل موادك الخام لمنتجات جاهزة ذات قيمة بيع أعلى بكثير من المواد الخام نفسها — استثمار ذكي لأرباحك!')
    .addFields(
      Object.entries(FACTORIES).map(([key, f]) => {
        const locked = farm.level < f.unlockLevel;
        if (locked) {
          return { name: `${f.emoji} ${f.label} 🔒`, value: lockNote(f), inline: true };
        }
        const owned = farm.buildings.includes(key);
        const recipeLines = Object.entries(f.recipe)
          .map(([item, qty]) => `${itemEmoji(item)} ${itemLabel(item)}: يحتاج **${qty}** (تملك: **${farm.inventory[item] || 0}**)`)
          .join('\n');
        return {
          name: `${f.emoji} ${f.label}` + (owned ? ' ✅' : ''),
          value:
            (owned ? '**مملوك** ✅\n' : `💰 تكلفة البناء: ${money(f.cost)}\n`) +
            `**الوصفة:**\n${recipeLines}\n**الناتج:** ${f.outputEmoji} ${f.outputLabel} (بيع ${money(f.outputSell)}/وحدة)`,
          inline: true
        };
      })
    );

  const buttons = Object.entries(FACTORIES).map(([key, f]) => {
    const locked = !isUnlocked(farm, f);
    if (locked) return new ButtonBuilder().setCustomId(`farm_locked_${key}`).setLabel(`🔒 ${f.label}`).setStyle(ButtonStyle.Secondary).setDisabled(true);
    const owned = farm.buildings.includes(key);
    return owned
      ? new ButtonBuilder().setCustomId(`farm_process_${key}`).setLabel(`تصنيع: ${f.label}`).setEmoji('⚙️').setStyle(ButtonStyle.Primary)
      : new ButtonBuilder().setCustomId(`farm_build_${key}`).setLabel(`بناء: ${f.label}`).setEmoji(f.emoji).setStyle(ButtonStyle.Success);
  });
  const row1 = new ActionRowBuilder().addComponents(buttons);
  const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('farm_back').setLabel('رجوع').setStyle(ButtonStyle.Secondary));

  const payload = { embeds: [embed], components: [row1, row2] };
  return withImage(embed, payload, 'factories');
}

function renderRealEstate(farm) {
  const embed = new EmbedBuilder()
    .setTitle('🏛️🏰 قسم العقارات والأصول الاستراتيجية 🏰🏛️')
    .setColor(EMBED_COLOR)
    .setDescription('استثمارات دائمة تمنحك مزايا طويلة الأمد لمزرعتك — تُشترى مرة واحدة فقط وتبقى ملكك للأبد.')
    .addFields(
      Object.entries(REAL_ESTATE).map(([key, r]) => {
        const locked = farm.level < r.unlockLevel;
        if (locked) return { name: `${r.emoji} ${r.label} 🔒`, value: lockNote(r), inline: true };
        const owned = farm.buildings.includes(key);
        return {
          name: `${r.emoji} ${r.label}` + (owned ? ' ✅' : ''),
          value: owned ? '**مملوك بالفعل** ✅' : `💰 التكلفة: ${money(r.cost)}\n📜 التأثير: ${r.effect}`,
          inline: true
        };
      })
    );

  const buttons = Object.entries(REAL_ESTATE).map(([key, r]) => {
    const locked = !isUnlocked(farm, r);
    const owned = farm.buildings.includes(key);
    return new ButtonBuilder()
      .setCustomId(`farm_build_${key}`)
      .setLabel(locked ? `🔒 ${r.label}` : owned ? `✅ ${r.label}` : `بناء: ${r.label}`)
      .setEmoji(r.emoji)
      .setStyle(owned ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(locked || owned);
  });
  const row1 = new ActionRowBuilder().addComponents(buttons);
  const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('farm_back').setLabel('رجوع').setStyle(ButtonStyle.Secondary));

  const payload = { embeds: [embed], components: [row1, row2] };
  return withImage(embed, payload, 'realestate');
}

function renderWorkers(farm) {
  const embed = new EmbedBuilder()
    .setTitle('👷🤖 قسم طاقم العمال 🤖👷')
    .setColor(EMBED_COLOR)
    .setDescription('وظّف طاقماً متخصصاً يساعدك على أتمتة وحماية مزرعتك — استثمار لمرة واحدة يوفر عليك مجهوداً مستمراً.')
    .addFields(
      Object.entries(WORKERS).map(([key, w]) => {
        const locked = farm.level < w.unlockLevel;
        if (locked) return { name: `${w.emoji} ${w.label} 🔒`, value: lockNote(w), inline: true };
        const owned = farm.workers.includes(key);
        return {
          name: `${w.emoji} ${w.label}` + (owned ? ' ✅' : ''),
          value: owned ? '**تم التعيين بالفعل** ✅' : `💰 التكلفة: ${money(w.cost)}\n📜 المهمة: ${w.effect}`,
          inline: true
        };
      })
    );

  const buttons = Object.entries(WORKERS).map(([key, w]) => {
    const locked = !isUnlocked(farm, w);
    const owned = farm.workers.includes(key);
    return new ButtonBuilder()
      .setCustomId(`farm_hire_${key}`)
      .setLabel(locked ? `🔒 ${w.label}` : owned ? `✅ ${w.label}` : `تعيين: ${w.label}`)
      .setEmoji(w.emoji)
      .setStyle(owned ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(locked || owned);
  });
  const row1 = new ActionRowBuilder().addComponents(buttons);
  const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('farm_back').setLabel('رجوع').setStyle(ButtonStyle.Secondary));

  const payload = { embeds: [embed], components: [row1, row2] };
  return withImage(embed, payload, 'workers');
}

function renderInventory(farm) {
  const entries = Object.entries(farm.inventory);
  const embed = new EmbedBuilder()
    .setTitle('📦🧺 مخزون مزرعتك 🧺📦')
    .setColor(EMBED_COLOR)
    .setDescription(entries.length ? 'هذه كل المنتجات المخزّنة حالياً في مزرعتك، جاهزة للبيع أو للتصنيع.' : '📭 مخزونك فارغ حالياً — اذهب لقسم المحاصيل أو الحيوانات لتبدأ الإنتاج!');

  if (entries.length) {
    embed.addFields(
      entries.map(([item, qty]) => ({
        name: `${itemEmoji(item)} ${itemLabel(item)}`,
        value: `الكمية: **${qty}**` + (sellPrice(item) != null ? `\nسعر البيع: ${money(sellPrice(item))}/وحدة` : ''),
        inline: true
      }))
    );
  }

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('farm_sell').setLabel('بيع عنصر').setEmoji('💰').setStyle(ButtonStyle.Primary).setDisabled(entries.length === 0),
    new ButtonBuilder().setCustomId('farm_back').setLabel('رجوع').setStyle(ButtonStyle.Secondary)
  );

  const payload = { embeds: [embed], components: [row1] };
  return withImage(embed, payload, 'inventory');
}

function renderMarket() {
  const weather = getCurrentWeather();
  const market = getMarketMultiplier();

  const embed = new EmbedBuilder()
    .setTitle('📊🌦️ السوق والطقس 🌦️📊')
    .setColor(EMBED_COLOR)
    .setDescription('راقب حالة السوق والطقس اللحظية — كلاهما يؤثر مباشرة على أرباحك وسرعة إنتاجك.')
    .addFields(
      { name: '🌦️ الطقس الحالي', value: `${weather.name}\n_${weather.desc}_\n📉 مضاعف نمو المحاصيل: **x${weather.yieldMult}**` },
      {
        name: '📈 مضاعف السوق',
        value:
          `القيمة الحالية: **x${market}**\n` +
          (market > 1.2
            ? '📈 **طفرة شرائية نشطة!** فرصة ممتازة لبيع منتجاتك الآن.'
            : market < 0.9
            ? '📉 السوق منخفض حالياً، يُفضّل الانتظار قليلاً قبل البيع.'
            : '⚖️ السوق مستقر حالياً.')
      }
    )
    .setFooter({ text: 'يتحدث مضاعف السوق تلقائياً كل 5 دقائق تقريباً.' });

  const payload = { embeds: [embed], components: [backRow()] };
  return withImage(embed, payload, 'market');
}

function renderHelp() {
  const embed = new EmbedBuilder()
    .setTitle('📖🌾 كتيب تعليمات إمبراطورية المزرعة الاقتصادية 🌾📖')
    .setColor(EMBED_COLOR)
    .setDescription(
      '**دليلك الكامل لكل أنظمة اللعبة!** 🧭\n' +
        'العملة المستخدمة هي رصيدك الحقيقي (wallet) في اقتصاد السيرفر — كل ربح أو خسارة هنا تنعكس مباشرة على رصيدك الفعلي.'
    )
    .addFields(
      {
        name: '🧭 كيف تبدأ خطوة بخطوة',
        value:
          '**1.** افتح `/farm` لعرض لوحتك.\n**2.** اختر "🌱 المحاصيل" وازرع محصولاً رخيصاً كالقمح أو الجزر.\n**3.** انتظر انتهاء وقت النمو ثم اضغط "حصاد الكل".\n**4.** بِع محاصيلك من "📦 المخزون والبيع" لجمع رصيد.\n**5.** كرر العملية وارفع مستواك لفتح محاصيل وحيوانات ومصانع أقوى!'
      },
      {
        name: '📶 نظام المستويات والفتح التدريجي',
        value:
          'تكسب خبرة (✨) عند حصاد المحاصيل. عتبة الترقية = **المستوى الحالي × 200** خبرة.\n' +
          'كل شي في اللعبة (محاصيل، حيوانات، مصانع، عقارات، عمال، وحتى عدد الأراضي المتاحة) **يُفتح تدريجياً** مع ارتفاع مستواك — كلما ارتفع مستواك زادت إمكانياتك وخياراتك.'
      },
      {
        name: '🗺️ الأراضي (Plots)',
        value: 'عدد الأراضي المتاحة للزراعة في نفس الوقت = **2 + مستواك** (حد أقصى 15 أرض). ارفع مستواك لتزرع أكثر بالتوازي.'
      },
      {
        name: '🌱 المحاصيل ومستوى فتحها',
        value: Object.values(CROPS)
          .map((c) => `${c.emoji} ${c.label}: يفتح Lv.${c.unlockLevel} — تكلفة ${money(c.cost)}، بيع ${money(c.sell)}، نمو ~${c.growSeconds}ث`)
          .join('\n')
      },
      {
        name: '🐄 الحيوانات ومستوى فتحها',
        value: Object.values(ANIMALS)
          .map((a) => `${a.emoji} ${a.label}: يفتح Lv.${a.unlockLevel} — تكلفة ${money(a.cost)}، ينتج ${RAW_PRODUCTS[a.product].label} كل ${a.produceSeconds}ث`)
          .join('\n')
      },
      {
        name: '🏭 المصانع ومستوى فتحها',
        value: Object.values(FACTORIES)
          .map((f) => {
            const recipe = Object.entries(f.recipe).map(([i, q]) => `${q}× ${itemLabel(i)}`).join(' + ');
            return `${f.emoji} ${f.label}: يفتح Lv.${f.unlockLevel} — ${recipe} ← ${f.outputLabel} (بناء ${money(f.cost)}، بيع ${money(f.outputSell)})`;
          })
          .join('\n')
      },
      {
        name: '🏛️ العقارات ومستوى فتحها (شراء لمرة واحدة)',
        value: Object.values(REAL_ESTATE).map((r) => `${r.emoji} ${r.label}: يفتح Lv.${r.unlockLevel} — ${r.effect} (${money(r.cost)})`).join('\n')
      },
      {
        name: '👷 العمال ومستوى فتحهم (شراء لمرة واحدة)',
        value: Object.values(WORKERS).map((w) => `${w.emoji} ${w.label}: يفتح Lv.${w.unlockLevel} — ${w.effect} (${money(w.cost)})`).join('\n')
      },
      {
        name: '📊 السوق والطقس',
        value:
          'الطقس يتغير عشوائياً ويؤثر على سرعة نمو المحاصيل (يسرّعها أو يبطئها). مضاعف السوق يتغير كل ~5 دقائق، وإذا تجاوز **x1.2** تنشط "طفرة شرائية" تزيد أرباح بيعك مؤقتاً.'
      },
      {
        name: '💰 كيف تباع المنتجات',
        value: 'من قسم "📦 المخزون والبيع" اضغط زر "بيع عنصر"، ستظهر لك نافذة صغيرة اكتب فيها اسم العنصر والكمية، والباقي يصير تلقائياً حسب مضاعف السوق الحالي.'
      }
    );

  const payload = { embeds: [embed], components: [backRow()] };
  return withImage(embed, payload, 'help');
}

// ---------------------------------------------------------------------------
// منطق العمليات الاقتصادية (شراء/بيع/بناء/تصنيع) مع فحص المستوى والقفل
// ---------------------------------------------------------------------------
async function doPlant(client, guildId, userId, cropKey) {
  const info = CROPS[cropKey];
  if (!info) {
    const { farm, userData } = await loadFarm(client, guildId, userId);
    return { farm, userData, note: '❌ محصول غير معروف.' };
  }

  const { farm: checkFarm, userData: checkData } = await loadFarm(client, guildId, userId);
  if (!isUnlocked(checkFarm, info)) return { farm: checkFarm, userData: checkData, note: `${lockNote(info)} لهذا المحصول.` };
  const cap = maxPlots(checkFarm.level);
  if (checkFarm.plots.length >= cap) {
    return { farm: checkFarm, userData: checkData, note: `🚫 وصلت للحد الأقصى من الأراضي (${cap}) لمستواك الحالي. ارفع مستواك لزيادة المساحة.` };
  }

  const userData = await EconomyService.removeMoney(client, guildId, userId, info.cost, 'farm_plant');
  const farm = getFarmState(userData);
  const weather = getCurrentWeather();
  const growTime = info.growSeconds / weather.yieldMult;
  farm.plots.push({ crop: cropKey, readyAt: Date.now() + growTime * 1000 });
  await setEconomyData(client, guildId, userId, userData);
  return { farm, userData, note: `🌱 زرعت ${info.emoji} ${info.label}، جاهز خلال ~${Math.round(growTime)} ثانية.` };
}

async function doHarvest(client, guildId, userId) {
  const userData = await getEconomyData(client, guildId, userId);
  const farm = getFarmState(userData);
  const now = Date.now();
  const harvested = {};
  const remaining = [];
  for (const plot of farm.plots) {
    if (plot.readyAt <= now) harvested[plot.crop] = (harvested[plot.crop] || 0) + 1;
    else remaining.push(plot);
  }
  if (Object.keys(harvested).length === 0) return { farm, userData, note: '⏳ لا توجد محاصيل جاهزة للحصاد بعد.' };

  for (const [crop, qty] of Object.entries(harvested)) addItem(farm, crop, qty);
  farm.plots = remaining;
  const total = Object.values(harvested).reduce((a, b) => a + b, 0);
  const leveledUp = addFarmExp(farm, total * 10);
  await setEconomyData(client, guildId, userId, userData);
  let note = '🌾 حصدت: ' + Object.entries(harvested).map(([c, q]) => `${itemEmoji(c)}×${q}`).join('، ');
  if (leveledUp) note += ` — 🎉 وصلت للمستوى ${farm.level}!`;
  return { farm, userData, note };
}

async function doBuyAnimal(client, guildId, userId, animalKey) {
  const info = ANIMALS[animalKey];
  const { farm: checkFarm, userData: checkData } = await loadFarm(client, guildId, userId);
  if (!isUnlocked(checkFarm, info)) return { farm: checkFarm, userData: checkData, note: `${lockNote(info)} لهذا الحيوان.` };

  const userData = await EconomyService.removeMoney(client, guildId, userId, info.cost, 'farm_buy_animal');
  const farm = getFarmState(userData);
  if (!farm.animals[animalKey]) farm.animals[animalKey] = { count: 0, collectAt: 0 };
  farm.animals[animalKey].count += 1;
  if (farm.animals[animalKey].collectAt === 0) farm.animals[animalKey].collectAt = Date.now() + info.produceSeconds * 1000;
  await setEconomyData(client, guildId, userId, userData);
  return { farm, userData, note: `🐣 اشتريت ${info.emoji} ${info.label}، الآن تملك ${farm.animals[animalKey].count}.` };
}

async function doCollect(client, guildId, userId) {
  const userData = await getEconomyData(client, guildId, userId);
  const farm = getFarmState(userData);
  const now = Date.now();
  const collected = {};
  for (const [animal, entry] of Object.entries(farm.animals)) {
    if (entry.count > 0 && entry.collectAt <= now) {
      const product = ANIMALS[animal].product;
      collected[product] = (collected[product] || 0) + entry.count;
      entry.collectAt = now + ANIMALS[animal].produceSeconds * 1000;
    }
  }
  if (Object.keys(collected).length === 0) return { farm, userData, note: '⏳ لا توجد منتجات جاهزة للجمع بعد.' };
  for (const [product, qty] of Object.entries(collected)) addItem(farm, product, qty);
  await setEconomyData(client, guildId, userId, userData);
  const note = '🧺 جمعت: ' + Object.entries(collected).map(([p, q]) => `${itemEmoji(p)}×${q}`).join('، ');
  return { farm, userData, note };
}

async function doBuild(client, guildId, userId, key) {
  const info = FACTORIES[key] || REAL_ESTATE[key];
  const { farm: checkFarm, userData: checkData } = await loadFarm(client, guildId, userId);
  if (!isUnlocked(checkFarm, info)) return { farm: checkFarm, userData: checkData, note: `${lockNote(info)} لهذا المبنى.` };
  if (checkFarm.buildings.includes(key)) return { farm: checkFarm, userData: checkData, note: '⚠️ تملك هذا المبنى بالفعل.' };

  const userData = await EconomyService.removeMoney(client, guildId, userId, info.cost, 'farm_build_' + key);
  const farm = getFarmState(userData);
  if (!farm.buildings.includes(key)) farm.buildings.push(key);
  await setEconomyData(client, guildId, userId, userData);
  return { farm, userData, note: `🏗️ تم بناء ${info.emoji} ${info.label}!` };
}

async function doHire(client, guildId, userId, key) {
  const info = WORKERS[key];
  const { farm: checkFarm, userData: checkData } = await loadFarm(client, guildId, userId);
  if (!isUnlocked(checkFarm, info)) return { farm: checkFarm, userData: checkData, note: `${lockNote(info)} لهذا العامل.` };
  if (checkFarm.workers.includes(key)) return { farm: checkFarm, userData: checkData, note: '⚠️ لديك هذا العامل بالفعل.' };

  const userData = await EconomyService.removeMoney(client, guildId, userId, info.cost, 'farm_hire_' + key);
  const farm = getFarmState(userData);
  if (!farm.workers.includes(key)) farm.workers.push(key);
  await setEconomyData(client, guildId, userId, userData);
  return { farm, userData, note: `👷 تم تعيين ${info.emoji} ${info.label}!` };
}

async function doProcess(client, guildId, userId, factoryKey) {
  const info = FACTORIES[factoryKey];
  const userData = await getEconomyData(client, guildId, userId);
  const farm = getFarmState(userData);
  if (!farm.buildings.includes(factoryKey)) return { farm, userData, note: `❌ تحتاج تبني ${info.label} أولاً.` };

  for (const [item, qty] of Object.entries(info.recipe)) {
    if ((farm.inventory[item] || 0) < qty) {
      return { farm, userData, note: `❌ تحتاج ${qty}× ${itemLabel(item)} ولا تملك ما يكفي (تملك ${farm.inventory[item] || 0}).` };
    }
  }
  for (const [item, qty] of Object.entries(info.recipe)) removeItem(farm, item, qty);
  addItem(farm, info.output, 1);
  await setEconomyData(client, guildId, userId, userData);
  return { farm, userData, note: `⚙️ صنّعت 1× ${info.outputEmoji} ${info.outputLabel} من ${info.label}.` };
}

async function doSell(client, guildId, userId, itemRaw, qtyRaw) {
  const item = String(itemRaw || '').trim().toLowerCase();
  const qty = parseInt(qtyRaw, 10);

  if (!item || !Number.isInteger(qty) || qty <= 0) return { note: '❌ أدخل اسم عنصر وكمية صحيحة.' };
  const basePrice = sellPrice(item);
  if (basePrice == null) return { note: `❌ العنصر "${item}" غير قابل للبيع أو غير موجود.` };

  const userData = await getEconomyData(client, guildId, userId);
  const farm = getFarmState(userData);
  if (!removeItem(farm, item, qty)) return { farm, userData, note: `❌ لا تملك ${qty}× ${itemLabel(item)} في مخزونك.` };
  await setEconomyData(client, guildId, userId, userData);

  const market = getMarketMultiplier();
  const total = Math.round(basePrice * qty * market);
  const finalData = await EconomyService.addMoney(client, guildId, userId, total, 'farm_sell_' + item);
  finalData.farm = farm;
  await setEconomyData(client, guildId, userId, finalData);

  let note = `💰 بعت ${qty}× ${itemEmoji(item)} ${itemLabel(item)} مقابل ${money(total)}`;
  if (market > 1.2) note += ' 📈 طفرة شرائية!';
  return { farm, userData: finalData, note };
}

// ---------------------------------------------------------------------------
// الأمر
// ---------------------------------------------------------------------------
export default {
  data: new SlashCommandBuilder().setName('farm').setDescription('لوحة تحكم لعبة إمبراطورية المزرعة الاقتصادية'),

  async execute(interaction) {
    const client = interaction.client;
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    try {
      const { userData, farm } = await loadFarm(client, guildId, userId);
      await setEconomyData(client, guildId, userId, userData);

      const view = renderMain(farm, userData);
      await interaction.reply(view);
      const message = await interaction.fetchReply();

      const collector = message.createMessageComponentCollector({ time: SESSION_MS });

      collector.on('collect', async (i) => {
        try {
          if (i.user.id !== userId) {
            await i.reply({ content: '🔒 هذه اللوحة ليست لك، استخدم `/farm` بنفسك.', ephemeral: true });
            return;
          }

          if (i.isStringSelectMenu() && i.customId === 'farm_menu') {
            const section = i.values[0];
            const { userData: ud, farm: f } = await loadFarm(client, guildId, userId);
            await setEconomyData(client, guildId, userId, ud);

            const views = {
              crops: renderCrops(f),
              animals: renderAnimals(f),
              factories: renderFactories(f),
              realestate: renderRealEstate(f),
              workers: renderWorkers(f),
              inventory: renderInventory(f),
              market: renderMarket(),
              help: renderHelp()
            };
            await i.update(views[section] || renderMain(f, ud));
            return;
          }

          if (i.isButton()) {
            const id = i.customId;

            if (id === 'farm_back') {
              const { userData: ud, farm: f } = await loadFarm(client, guildId, userId);
              await setEconomyData(client, guildId, userId, ud);
              await i.update(renderMain(f, ud));
              return;
            }

            if (id === 'farm_sell') {
              const modal = new ModalBuilder().setCustomId('farm_sell_modal').setTitle('💰 بيع عنصر من المخزون');
              const itemInput = new TextInputBuilder()
                .setCustomId('farm_sell_item')
                .setLabel('اسم العنصر (بالإنجليزي مثل wheat)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);
              const qtyInput = new TextInputBuilder().setCustomId('farm_sell_qty').setLabel('الكمية').setStyle(TextInputStyle.Short).setRequired(true);
              modal.addComponents(new ActionRowBuilder().addComponents(itemInput), new ActionRowBuilder().addComponents(qtyInput));
              await i.showModal(modal);

              const submitted = await i
                .awaitModalSubmit({ filter: (m) => m.customId === 'farm_sell_modal' && m.user.id === userId, time: 60000 })
                .catch(() => null);
              if (!submitted) return;

              const itemVal = submitted.fields.getTextInputValue('farm_sell_item');
              const qtyVal = submitted.fields.getTextInputValue('farm_sell_qty');
              const result = await doSell(client, guildId, userId, itemVal, qtyVal);
              const farmForView = result.farm || (await loadFarm(client, guildId, userId)).farm;
              const view = renderInventory(farmForView);
              view.content = result.note;
              await submitted.update(view);
              return;
            }

            let result = null;
            if (id.startsWith('farm_plant_')) result = await doPlant(client, guildId, userId, id.replace('farm_plant_', ''));
            else if (id === 'farm_harvest') result = await doHarvest(client, guildId, userId);
            else if (id.startsWith('farm_buyanimal_')) result = await doBuyAnimal(client, guildId, userId, id.replace('farm_buyanimal_', ''));
            else if (id === 'farm_collect') result = await doCollect(client, guildId, userId);
            else if (id.startsWith('farm_build_')) result = await doBuild(client, guildId, userId, id.replace('farm_build_', ''));
            else if (id.startsWith('farm_hire_')) result = await doHire(client, guildId, userId, id.replace('farm_hire_', ''));
            else if (id.startsWith('farm_process_')) result = await doProcess(client, guildId, userId, id.replace('farm_process_', ''));

            if (result) {
              let view;
              const key = id.replace(/^farm_(plant|buyanimal|build|hire|process)_/, '');
              if (id.startsWith('farm_plant_') || id === 'farm_harvest') view = renderCrops(result.farm);
              else if (id.startsWith('farm_buyanimal_') || id === 'farm_collect') view = renderAnimals(result.farm);
              else if (id.startsWith('farm_process_')) view = renderFactories(result.farm);
              else if (id.startsWith('farm_build_') && FACTORIES[key]) view = renderFactories(result.farm);
              else if (id.startsWith('farm_build_') && REAL_ESTATE[key]) view = renderRealEstate(result.farm);
              else if (id.startsWith('farm_hire_')) view = renderWorkers(result.farm);
              else view = renderMain(result.farm, result.userData);

              view.content = result.note;
              await i.update(view);
            }
          }
        } catch (err) {
          const msg = errMsg(err);
          try {
            if (!i.replied && !i.deferred) await i.reply({ content: `❌ ${msg}`, ephemeral: true });
            else await i.followUp({ content: `❌ ${msg}`, ephemeral: true });
          } catch (_) {
            /* تجاهل فشل إرسال رسالة الخطأ نفسها */
          }
        }
      });

      collector.on('end', async () => {
        try {
          await interaction.editReply({ components: [] });
        } catch (_) {
          /* الرسالة قد تكون محذوفة أو منتهية الصلاحية */
        }
      });
    } catch (error) {
      const message = errMsg(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: `❌ ${message}`, ephemeral: true });
      } else {
        await interaction.reply({ content: `❌ ${message}`, ephemeral: true });
      }
    }
  }
};
