// src/commands/Economy/farm.js
//
// ============================================================================
// لعبة "إمبراطورية المزرعة الاقتصادية" — النسخة v4
// لوحة تحكم واحدة (Embed + قائمة اختيار + أزرار) مع:
//   - نظام مستويات يفتح تدريجياً كل شي (محاصيل/حيوانات/مصانع/أراضٍ/عقارات/عمال)
//   - سقف للحيوانات مرتبط بالمستوى (بالإضافة لسقف الأراضي)
//   - نظام كوارث عشوائي (جراد / عاصفة رياح) مع إمكانية الحماية
//   - ضرائب مياه وكهرباء تُخصم عند السقي والتصنيع، تنخفض لـ 10% بعد شراء
//     بئر مياه / محطة طاقة شمسية
//   - المحاصيل تحتاج سقي (وإلا ينقص إنتاجها)، والحيوانات تحتاج إطعام وسقي
//     وإلا تموت، ولها عمر معين تموت بعده طبيعياً
//   - عمال جدد: شبكة ري أوتوماتيكية + راعي مواشٍ آلي (يلغيان الحاجة للرعاية اليدوية)
// العملة = wallet الحقيقي في نظام الإيكونومي عندكم (EconomyService).
// ============================================================================
//
// 🖼️ الصور: أرفقت لك صور PNG جاهزة (مرسومة أصلياً، بلا حقوق ملكية) لكل قسم.
// حط الملفات في: assets/farm/main.png, crops.png, animals.png, factories.png,
// realestate.png, workers.png, inventory.png, market.png, help.png
// (بجانب مجلد src في جذر المشروع). لو ملف ناقص، القسم يشتغل بدون صورة بأمان.
// ============================================================================

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

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// ---------------------------------------------------------------------------
// بيانات اللعبة
// ---------------------------------------------------------------------------
const CROPS = {
  wheat: { label: 'قمح', emoji: '🌾', growSeconds: 60, cost: 10, sell: 18, unlockLevel: 1 },
  carrot: { label: 'جزر', emoji: '🥕', growSeconds: 40, cost: 7, sell: 12, unlockLevel: 1 },
  beans: { label: 'فاصوليا', emoji: '🫘', growSeconds: 45, cost: 8, sell: 14, unlockLevel: 2 },
  corn: { label: 'ذرة', emoji: '🌽', growSeconds: 90, cost: 15, sell: 26, unlockLevel: 3 },
  strawberry: { label: 'فراولة', emoji: '🍓', growSeconds: 120, cost: 25, sell: 45, unlockLevel: 5 },
  grapes: { label: 'عنب', emoji: '🍇', growSeconds: 150, cost: 30, sell: 55, unlockLevel: 8 }
};

// عدد الوحدات الأساسي الذي ينتجه الحقل الواحد عند الحصاد (قبل أي كوارث/ذبول)
const BASE_HARVEST_YIELD = 2;

const ANIMALS = {
  chicken: { label: 'دجاجة', emoji: '🐔', cost: 80, product: 'eggs', produceSeconds: 180, unlockLevel: 1, maxAgeMs: 3 * DAY },
  sheep: { label: 'خروف', emoji: '🐑', cost: 150, product: 'wool', produceSeconds: 420, unlockLevel: 3, maxAgeMs: 5 * DAY },
  cow: { label: 'بقرة', emoji: '🐄', cost: 200, product: 'milk', produceSeconds: 300, unlockLevel: 5, maxAgeMs: 7 * DAY },
  beehive: { label: 'خلية نحل', emoji: '🐝', cost: 220, product: 'honey', produceSeconds: 360, unlockLevel: 7, maxAgeMs: 10 * DAY }
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
  water_well: { label: 'بئر مياه خاص', emoji: '🪣', cost: 1300, effect: 'تخفيض ضريبة المياه إلى 10% من قيمتها', unlockLevel: 6 },
  farmshop: { label: 'سوق المزرعة', emoji: '🏪', cost: 1500, effect: 'زيادة سعر بيع كل المنتجات 10%', unlockLevel: 8 },
  solar_plant: { label: 'محطة الطاقة الشمسية', emoji: '☀️', cost: 3000, effect: 'تخفيض ضريبة الكهرباء إلى 10% من قيمتها', unlockLevel: 12 },
  palace: { label: 'القصر الرئيسي', emoji: '🏰', cost: 5000, effect: 'مكانة رفيعة ودخل يومي إضافي', unlockLevel: 20 }
};

const WORKERS = {
  guard_dog: { label: 'حارس المزرعة', emoji: '🐕', cost: 300, effect: 'يقلّل فرصة تعرضك لغزوات الجراد', unlockLevel: 3 },
  truck_driver: { label: 'سائق الشاحنة', emoji: '🚚', cost: 600, effect: 'بيع تلقائي للمخزون الفائض', unlockLevel: 7 },
  irrigation_network: { label: 'شبكة ري أوتوماتيكية', emoji: '💧', cost: 900, effect: 'تسقي حقولك تلقائياً، ما تحتاج تسقيها يدوياً', unlockLevel: 6 },
  livestock_caretaker: { label: 'راعي مواشٍ آلي', emoji: '🧑‍🌾', cost: 950, effect: 'يطعم ويسقي حيواناتك تلقائياً، ما تموت من الإهمال', unlockLevel: 8 },
  auto_harvester: { label: 'الحاصد الآلي', emoji: '🤖', cost: 800, effect: 'حصاد تلقائي دوري لكل حقولك', unlockLevel: 10 }
};

const WEATHER_TYPES = [
  { name: '☀️ مشمس', desc: 'أجواء صافية ومثالية للزراعة', yieldMult: 1.15 },
  { name: '⛅ غائم', desc: 'أجواء معتدلة، نمو طبيعي', yieldMult: 1.0 },
  { name: '🌧️ ممطر', desc: 'أمطار غزيرة تسرّع نمو المحاصيل', yieldMult: 1.25 },
  { name: '🌵 جفاف', desc: 'موجة جفاف تبطئ نمو المحاصيل', yieldMult: 0.7 },
  { name: '❄️ صقيع', desc: 'برد قارس يضر بالمحاصيل الحساسة', yieldMult: 0.5 }
];

// كوارث عشوائية تُفحص عند الحصاد لكل حقل جاهز
const DISASTERS = {
  locust: { label: 'غزو جراد', emoji: '🦗', chance: 0.15, reduction: 0.3 },
  windstorm: { label: 'عاصفة رياح', emoji: '🌪️', chance: 0.1, reduction: 0.5 }
};

// ضرائب المرافق الأساسية (قبل أي خصومات من العقارات)
const BASE_WATER_TAX = 8;
const BASE_ELECTRICITY_TAX = 8;
const FEED_COST_PER_TYPE = 6;

// فترات الإهمال قبل موت الحيوانات (بدون راعٍ آلي)
const FEED_INTERVAL_MS = 6 * HOUR;
const WATER_INTERVAL_MS = 6 * HOUR;

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
// نظام المستويات: سقف الأراضي والحيوانات يزيد مع المستوى
// ---------------------------------------------------------------------------
function maxPlots(level) {
  return Math.min(2 + level, 15);
}

function maxAnimals(level) {
  return Math.min(3 + level * 2, 40);
}

function totalAnimalsOwned(farm) {
  return Object.values(farm.animals).reduce((sum, e) => sum + (e.count || 0), 0);
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
// الضرائب (تنخفض لـ 10% بامتلاك العقار المناسب)
// ---------------------------------------------------------------------------
function waterTax(farm) {
  return farm.buildings.includes('water_well') ? Math.max(1, Math.round(BASE_WATER_TAX * 0.1)) : BASE_WATER_TAX;
}

function electricityTax(farm) {
  return farm.buildings.includes('solar_plant') ? Math.max(1, Math.round(BASE_ELECTRICITY_TAX * 0.1)) : BASE_ELECTRICITY_TAX;
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

// يطبّق نتائج الإهمال (جوع/عطش/تقدم بالعمر) على الحيوانات في كل مرة تُفتح فيها اللوحة
function applyLivestockUpkeep(farm) {
  const now = Date.now();
  const hasCaretaker = farm.workers.includes('livestock_caretaker');
  const notes = [];

  for (const [key, entry] of Object.entries(farm.animals)) {
    if (!entry || entry.count <= 0) continue;
    const info = ANIMALS[key];
    if (!info) continue;

    if (!entry.lastFed) entry.lastFed = now;
    if (!entry.lastWatered) entry.lastWatered = now;
    if (!entry.bornAt) entry.bornAt = now;

    if (!hasCaretaker) {
      const missedFeeds = Math.floor((now - entry.lastFed) / FEED_INTERVAL_MS);
      const missedWaters = Math.floor((now - entry.lastWatered) / WATER_INTERVAL_MS);
      const neglectDeaths = Math.min(entry.count, Math.max(missedFeeds, missedWaters));
      if (neglectDeaths > 0) {
        entry.count -= neglectDeaths;
        entry.lastFed = now;
        entry.lastWatered = now;
        notes.push(`💀 نفق ${neglectDeaths}× ${info.label} بسبب إهمال الإطعام/السقي.`);
      }
    }

    if (entry.count > 0) {
      const age = now - entry.bornAt;
      if (age > info.maxAgeMs) {
        const cyclesPast = Math.floor((age - info.maxAgeMs) / info.maxAgeMs) + 1;
        const ageDeaths = Math.min(entry.count, cyclesPast);
        if (ageDeaths > 0) {
          entry.count -= ageDeaths;
          entry.bornAt = now;
          notes.push(`⌛ نفق ${ageDeaths}× ${info.label} بسبب التقدم في العمر — جدّد قطيعك بشراء المزيد.`);
        }
      }
    }

    if (entry.count <= 0) delete farm.animals[key];
  }
  return notes;
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
  const upkeepNotes = applyLivestockUpkeep(farm);
  return { userData, farm, upkeepNotes };
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
      { label: 'المحاصيل', value: 'crops', emoji: '🌱', description: 'ازرع، اسقِ، واحصد محاصيلك' },
      { label: 'الحيوانات', value: 'animals', emoji: '🐄', description: 'اقتنِ، أطعِم، واجمع منتجاتها' },
      { label: 'المصانع', value: 'factories', emoji: '🏭', description: 'حوّل موادك الخام لمنتجات ثمينة' },
      { label: 'العقارات', value: 'realestate', emoji: '🏛️', description: 'أصول استراتيجية تخفّض الضرائب' },
      { label: 'العمال', value: 'workers', emoji: '👷', description: 'أتمتة الري والرعاية والحماية' },
      { label: 'المخزون والبيع', value: 'inventory', emoji: '📦', description: 'راجع مخزونك وبِع منتجاتك' },
      { label: 'السوق والطقس', value: 'market', emoji: '📊', description: 'راقب الأسعار والطقس اللحظي' },
      { label: 'كتيب التعليمات', value: 'help', emoji: '📖', description: 'دليل شامل لكل أنظمة اللعبة' }
    );
  return new ActionRowBuilder().addComponents(menu);
}

// ---------------------------------------------------------------------------
// عرض الأقسام
// ---------------------------------------------------------------------------
function renderMain(farm, userData, upkeepNotes = []) {
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
        (upkeepNotes.length ? upkeepNotes.map((n) => `⚠️ ${n}`).join('\n') + '\n\n' : '') +
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
      { name: '🗺️ الأراضي', value: `${plotsUsed} / ${plotsMax}`, inline: true },
      { name: '🐄 الحيوانات', value: `${totalAnimalsOwned(farm)} / ${maxAnimals(farm.level)}`, inline: true },
      { name: '🏗️ المباني والعمال', value: String(farm.buildings.length + farm.workers.length), inline: true },
      { name: '💧 ضريبة المياه', value: `${money(waterTax(farm))}/عملية`, inline: true },
      { name: '⚡ ضريبة الكهرباء', value: `${money(electricityTax(farm))}/عملية`, inline: true }
    )
    .setFooter({ text: '💡 افتح "كتيب التعليمات" لتعرف كل شي بالتفصيل. تُغلق اللوحة تلقائياً بعد 10 دقائق خمول.' });

  const payload = { embeds: [embed], components: [mainMenuRow()] };
  return withImage(embed, payload, 'main');
}

function renderCrops(farm) {
  const plotsUsed = farm.plots.length;
  const plotsMax = maxPlots(farm.level);
  const unprotected = farm.plots.filter((p) => !p.protected).length;

  const embed = new EmbedBuilder()
    .setTitle('🌱🌾 قسم المحاصيل 🌾🌱')
    .setColor(EMBED_COLOR)
    .setDescription(
      `ازرع بذورك، اسقِها بانتظام، واحذر الكوارث الطبيعية 🦗🌪️ — ثم احصدها لتحصل على محاصيل تبيعها أو تصنّعها.\n\n` +
        `🗺️ **الأراضي:** ${plotsUsed} / ${plotsMax} ` +
        (plotsUsed >= plotsMax ? '⚠️ (وصلت للحد الأقصى)' : '') +
        `\n💧 **ضريبة السقي:** ${money(waterTax(farm))} لكل عملية سقي` +
        (farm.workers.includes('irrigation_network') ? '\n✅ شبكة الري الأوتوماتيكية تسقي حقولك تلقائياً!' : '')
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
    embed.addFields({
      name: '📋 حقولك الحالية',
      value:
        `لديك ${plotsUsed} حقل مزروع الآن (${plotsUsed - unprotected} محمي 🛡️ / ${unprotected} غير محمي).\n` +
        'استخدم "سقي الكل" بانتظام، و"حماية الحقول" قبل الحصاد لتقليل ضرر الكوارث المحتملة.'
    });
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

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('farm_water_crops')
      .setLabel('سقي الكل')
      .setEmoji('💧')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(plotsUsed === 0),
    new ButtonBuilder()
      .setCustomId('farm_protect_crops')
      .setLabel('حماية الحقول')
      .setEmoji('🛡️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(unprotected === 0)
  );

  const payload = { embeds: [embed], components: [row1, row2, row3] };
  return withImage(embed, payload, 'crops');
}

function renderAnimals(farm) {
  const owned = totalAnimalsOwned(farm);
  const cap = maxAnimals(farm.level);
  const hasCaretaker = farm.workers.includes('livestock_caretaker');

  const embed = new EmbedBuilder()
    .setTitle('🐄🐔 قسم الحيوانات 🐔🐄')
    .setColor(EMBED_COLOR)
    .setDescription(
      'اقتنِ حيوانات لمزرعتك — تحتاج تطعمها وتسقيها بانتظام وإلا تموت، ولها عمر معين تموت بعده طبيعياً.\n\n' +
        `🐾 **السعة الإجمالية:** ${owned} / ${cap} ` +
        (owned >= cap ? '⚠️ (وصلت للحد الأقصى)' : '') +
        `\n🍽️ **تكلفة الرعاية:** ${money(FEED_COST_PER_TYPE)} إطعام + ${money(waterTax(farm))} سقي لكل نوع تملكه` +
        (hasCaretaker ? '\n✅ الراعي الآلي يطعم ويسقي حيواناتك تلقائياً!' : '')
    )
    .addFields(
      Object.entries(ANIMALS).map(([key, a]) => {
        const locked = farm.level < a.unlockLevel;
        const entry = farm.animals[key];
        const ownedCount = entry?.count || 0;
        if (locked) return { name: `${a.emoji} ${a.label} 🔒`, value: lockNote(a), inline: true };
        const ageDays = entry?.bornAt ? Math.floor((Date.now() - entry.bornAt) / DAY) : 0;
        return {
          name: `${a.emoji} ${a.label}`,
          value:
            `💰 التكلفة: ${money(a.cost)}\n📦 ينتج: ${RAW_PRODUCTS[a.product].emoji} ${RAW_PRODUCTS[a.product].label} كل ${a.produceSeconds}ث\n` +
            `⌛ العمر الافتراضي: ~${Math.round(a.maxAgeMs / DAY)} يوم\n🔢 تملك حالياً: **${ownedCount}**` +
            (ownedCount > 0 ? ` (عمر القطيع: ${ageDays} يوم)` : ''),
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
        .setDisabled(locked || owned >= cap);
    })
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('farm_collect').setLabel('جمع المنتجات').setEmoji('🧺').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('farm_care_animals').setLabel('إطعام وسقي').setEmoji('🍽️').setStyle(ButtonStyle.Success).setDisabled(owned === 0),
    new ButtonBuilder().setCustomId('farm_back').setLabel('رجوع').setStyle(ButtonStyle.Secondary)
  );

  const payload = { embeds: [embed], components: [row1, row2] };
  return withImage(embed, payload, 'animals');
}

function renderFactories(farm) {
  const embed = new EmbedBuilder()
    .setTitle('🏭⚙️ قسم المصانع ⚙️🏭')
    .setColor(EMBED_COLOR)
    .setDescription(
      'حوّل موادك الخام لمنتجات جاهزة ذات قيمة بيع أعلى — كل عملية تصنيع تستهلك كهرباء وتُخصم منها ضريبة.\n\n' +
        `⚡ **ضريبة الكهرباء:** ${money(electricityTax(farm))} لكل عملية تصنيع` +
        (farm.buildings.includes('solar_plant') ? ' ✅ (مخفّضة بفضل محطة الطاقة الشمسية)' : '')
    )
    .addFields(
      Object.entries(FACTORIES).map(([key, f]) => {
        const locked = farm.level < f.unlockLevel;
        if (locked) return { name: `${f.emoji} ${f.label} 🔒`, value: lockNote(f), inline: true };
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
    .setDescription('استثمارات دائمة تمنحك مزايا طويلة الأمد — بما فيها خفض ضرائب المياه والكهرباء بشكل كبير.')
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
    .setDescription('وظّف طاقماً متخصصاً يؤتمت الري والرعاية والحماية — استثمار لمرة واحدة يوفر عليك مجهوداً مستمراً.')
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
  const row1 = new ActionRowBuilder().addComponents(buttons.slice(0, 5));
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
      },
      {
        name: '🦗🌪️ الكوارث المحتملة',
        value: `${DISASTERS.locust.emoji} غزو جراد: فرصة ${Math.round(DISASTERS.locust.chance * 100)}%، ينقص الإنتاج ${Math.round(DISASTERS.locust.reduction * 100)}%\n${DISASTERS.windstorm.emoji} عاصفة رياح: فرصة ${Math.round(DISASTERS.windstorm.chance * 100)}%، ينقص الإنتاج ${Math.round(DISASTERS.windstorm.reduction * 100)}%\n🛡️ الحماية تقلّل الضرر للنصف.`
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
          '**1.** افتح `/farm`.\n**2.** ازرع محصولاً من "🌱 المحاصيل" واسقه بزر "سقي الكل".\n**3.** بعد اكتمال النمو اضغط "حصاد الكل".\n**4.** بِع المحاصيل من "📦 المخزون والبيع".\n**5.** كرر وارفع مستواك لتفتح خيارات أقوى!'
      },
      {
        name: '📶 المستويات والفتح التدريجي',
        value: 'عتبة الترقية = **المستوى × 200** خبرة. كل شي (محاصيل/حيوانات/مصانع/عقارات/عمال/سعة الأراضي والحيوانات) يُفتح تدريجياً مع ارتفاع مستواك.'
      },
      {
        name: '🗺️ الأراضي والحيوانات',
        value: `سقف الأراضي = 2 + المستوى (حتى 15). سقف الحيوانات الإجمالي = 3 + (المستوى×2) (حتى 40).`
      },
      {
        name: '💧⚡ الضرائب',
        value:
          `كل عملية سقي للمحاصيل أو رعاية للحيوانات تُخصم منها **ضريبة مياه** (${money(BASE_WATER_TAX)} أساسي)، وكل عملية تصنيع تُخصم منها **ضريبة كهرباء** (${money(BASE_ELECTRICITY_TAX)} أساسي).\n` +
          'بناء 🪣 بئر مياه يخفّض ضريبة المياه لـ10% من قيمتها، وبناء ☀️ محطة طاقة شمسية يخفّض ضريبة الكهرباء لـ10% من قيمتها.'
      },
      {
        name: '💧🌱 سقي المحاصيل (إجباري)',
        value: 'إذا حصدت حقلاً لم تسقه أبداً منذ زراعته، ينخفض إنتاجه للنصف. استخدم زر "سقي الكل" بانتظام، أو وظّف 💧 شبكة الري الأوتوماتيكية لتتكفل بالمهمة تلقائياً.'
      },
      {
        name: '🍽️💧 إطعام وسقي الحيوانات (إجباري)',
        value: `إذا مرّ أكثر من ${Math.round(FEED_INTERVAL_MS / HOUR)} ساعة بدون إطعام أو سقي، تبدأ حيواناتك بالنفوق تدريجياً. استخدم زر "إطعام وسقي" بانتظام، أو وظّف 🧑‍🌾 راعي مواشٍ آلي ليقوم بالمهمة تلقائياً.`
      },
      {
        name: '⌛ عمر الحيوانات',
        value: Object.values(ANIMALS).map((a) => `${a.emoji} ${a.label}: يعيش ~${Math.round(a.maxAgeMs / DAY)} يوم قبل أن ينفق طبيعياً.`).join('\n')
      },
      {
        name: '🦗🌪️ الكوارث الطبيعية',
        value:
          'عند الحصاد قد تحدث كارثة عشوائية: غزو جراد (ينقص الإنتاج 30%) أو عاصفة رياح (ينقص الإنتاج 50%). فعّل "🛡️ حماية الحقول" قبل الحصاد لتقليل الضرر للنصف. امتلاك 🐕 حارس المزرعة يقلّل فرصة الجراد أيضاً.'
      },
      {
        name: '🌱 المحاصيل',
        value: Object.values(CROPS)
          .map((c) => `${c.emoji} ${c.label}: Lv.${c.unlockLevel} — ${money(c.cost)}، بيع ${money(c.sell)}، نمو ~${c.growSeconds}ث`)
          .join('\n')
      },
      {
        name: '🐄 الحيوانات',
        value: Object.values(ANIMALS)
          .map((a) => `${a.emoji} ${a.label}: Lv.${a.unlockLevel} — ${money(a.cost)}، ينتج ${RAW_PRODUCTS[a.product].label} كل ${a.produceSeconds}ث`)
          .join('\n')
      },
      {
        name: '🏭 المصانع',
        value: Object.values(FACTORIES)
          .map((f) => {
            const recipe = Object.entries(f.recipe).map(([i, q]) => `${q}× ${itemLabel(i)}`).join(' + ');
            return `${f.emoji} ${f.label}: Lv.${f.unlockLevel} — ${recipe} ← ${f.outputLabel}`;
          })
          .join('\n')
      },
      {
        name: '🏛️ العقارات و👷 العمال',
        value:
          Object.values(REAL_ESTATE).map((r) => `${r.emoji} ${r.label}: Lv.${r.unlockLevel} — ${r.effect}`).join('\n') +
          '\n' +
          Object.values(WORKERS).map((w) => `${w.emoji} ${w.label}: Lv.${w.unlockLevel} — ${w.effect}`).join('\n')
      }
    );

  const payload = { embeds: [embed], components: [backRow()] };
  return withImage(embed, payload, 'help');
}

// ---------------------------------------------------------------------------
// منطق العمليات الاقتصادية
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
  const now = Date.now();
  farm.plots.push({ crop: cropKey, plantedAt: now, readyAt: now + growTime * 1000, wateredAt: null, protected: false });
  await setEconomyData(client, guildId, userId, userData);
  return { farm, userData, note: `🌱 زرعت ${info.emoji} ${info.label}، جاهز خلال ~${Math.round(growTime)} ثانية. لا تنسَ تسقيه!` };
}

async function doWaterCrops(client, guildId, userId) {
  const { farm: checkFarm } = await loadFarm(client, guildId, userId);
  if (checkFarm.plots.length === 0) {
    const { farm, userData } = await loadFarm(client, guildId, userId);
    return { farm, userData, note: 'لا توجد حقول لسقيها حالياً.' };
  }

  const tax = waterTax(checkFarm);
  const userData = await EconomyService.removeMoney(client, guildId, userId, tax, 'farm_water_tax');
  const farm = getFarmState(userData);
  const now = Date.now();
  for (const plot of farm.plots) plot.wateredAt = now;
  await setEconomyData(client, guildId, userId, userData);
  return { farm, userData, note: `💧 سقيت كل حقولك (${farm.plots.length}). ضريبة المياه المخصومة: ${money(tax)}.` };
}

async function doProtectCrops(client, guildId, userId) {
  const { farm: checkFarm } = await loadFarm(client, guildId, userId);
  const unprotected = checkFarm.plots.filter((p) => !p.protected).length;
  if (unprotected === 0) {
    const { farm, userData } = await loadFarm(client, guildId, userId);
    return { farm, userData, note: 'كل حقولك محمية بالفعل.' };
  }

  const cost = unprotected * 10;
  const userData = await EconomyService.removeMoney(client, guildId, userId, cost, 'farm_protect');
  const farm = getFarmState(userData);
  for (const plot of farm.plots) plot.protected = true;
  await setEconomyData(client, guildId, userId, userData);
  return { farm, userData, note: `🛡️ تم تفعيل الحماية على ${unprotected} حقل مقابل ${money(cost)}. الضرر من الكوارث سينخفض للنصف.` };
}

async function doHarvest(client, guildId, userId) {
  const userData = await getEconomyData(client, guildId, userId);
  const farm = getFarmState(userData);
  const now = Date.now();
  const harvested = {};
  const eventNotes = [];
  const remaining = [];

  for (const plot of farm.plots) {
    if (plot.readyAt > now) {
      remaining.push(plot);
      continue;
    }

    let yieldAmount = BASE_HARVEST_YIELD;
    const wasWatered = !!plot.wateredAt && plot.wateredAt >= plot.plantedAt;
    const hasIrrigation = farm.workers.includes('irrigation_network');
    if (!wasWatered && !hasIrrigation) {
      yieldAmount *= 0.5;
      eventNotes.push(`🥀 حقل ${itemEmoji(plot.crop)} ${itemLabel(plot.crop)} ذبل قليلاً لأنك ما سقيته (إنتاج -50%).`);
    }

    for (const [key, d] of Object.entries(DISASTERS)) {
      let chance = d.chance;
      if (key === 'locust' && farm.workers.includes('guard_dog')) chance *= 0.5;
      if (Math.random() < chance) {
        const reduction = plot.protected ? d.reduction / 2 : d.reduction;
        yieldAmount *= 1 - reduction;
        eventNotes.push(
          `${d.emoji} ${d.label} ضربت حقل ${itemEmoji(plot.crop)} ${itemLabel(plot.crop)}!` + (plot.protected ? ' (الحماية خفّضت الضرر للنصف 🛡️)' : '')
        );
      }
    }

    const finalQty = Math.max(0, Math.round(yieldAmount));
    if (finalQty > 0) harvested[plot.crop] = (harvested[plot.crop] || 0) + finalQty;
  }

  if (Object.keys(harvested).length === 0 && eventNotes.length === 0) {
    return { farm, userData, note: '⏳ لا توجد محاصيل جاهزة للحصاد بعد.' };
  }

  for (const [crop, qty] of Object.entries(harvested)) addItem(farm, crop, qty);
  farm.plots = remaining;
  const total = Object.values(harvested).reduce((a, b) => a + b, 0);
  const leveledUp = total > 0 ? addFarmExp(farm, total * 10) : false;
  await setEconomyData(client, guildId, userId, userData);

  let note = Object.keys(harvested).length
    ? '🌾 حصدت: ' + Object.entries(harvested).map(([c, q]) => `${itemEmoji(c)}×${q}`).join('، ')
    : '😢 للأسف الكارثة أتلفت المحصول بالكامل هذه المرة.';
  if (eventNotes.length) note += '\n' + eventNotes.join('\n');
  if (leveledUp) note += `\n🎉 وصلت للمستوى ${farm.level}!`;
  return { farm, userData, note };
}

async function doBuyAnimal(client, guildId, userId, animalKey) {
  const info = ANIMALS[animalKey];
  const { farm: checkFarm, userData: checkData } = await loadFarm(client, guildId, userId);
  if (!isUnlocked(checkFarm, info)) return { farm: checkFarm, userData: checkData, note: `${lockNote(info)} لهذا الحيوان.` };

  const cap = maxAnimals(checkFarm.level);
  const owned = totalAnimalsOwned(checkFarm);
  if (owned >= cap) {
    return {
      farm: checkFarm,
      userData: checkData,
      note: `🚫 وصلت للحد الأقصى من الحيوانات (${cap}) لمستواك الحالي. ارفع مستواك لزيادة السعة.`
    };
  }

  const userData = await EconomyService.removeMoney(client, guildId, userId, info.cost, 'farm_buy_animal');
  const farm = getFarmState(userData);
  const now = Date.now();
  if (!farm.animals[animalKey]) farm.animals[animalKey] = { count: 0, collectAt: 0, lastFed: now, lastWatered: now, bornAt: now };
  farm.animals[animalKey].count += 1;
  if (farm.animals[animalKey].collectAt === 0) farm.animals[animalKey].collectAt = now + info.produceSeconds * 1000;
  await setEconomyData(client, guildId, userId, userData);
  return { farm, userData, note: `🐣 اشتريت ${info.emoji} ${info.label}، الآن تملك ${farm.animals[animalKey].count}.` };
}

async function doCareAnimals(client, guildId, userId) {
  const { farm: checkFarm } = await loadFarm(client, guildId, userId);
  const types = Object.keys(checkFarm.animals);
  if (types.length === 0) {
    const { farm, userData } = await loadFarm(client, guildId, userId);
    return { farm, userData, note: 'لا تملك حيوانات لرعايتها حالياً.' };
  }

  const feedCost = types.length * FEED_COST_PER_TYPE;
  const waterCost = types.length * waterTax(checkFarm);
  const totalCost = feedCost + waterCost;

  const userData = await EconomyService.removeMoney(client, guildId, userId, totalCost, 'farm_care_animals');
  const farm = getFarmState(userData);
  const now = Date.now();
  for (const entry of Object.values(farm.animals)) {
    entry.lastFed = now;
    entry.lastWatered = now;
  }
  await setEconomyData(client, guildId, userId, userData);
  return { farm, userData, note: `🍽️💧 تم إطعام وسقي كل حيواناتك (${types.length} نوع). التكلفة الكلية: ${money(totalCost)}.` };
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

  const tax = electricityTax(farm);
  const paidUserData = await EconomyService.removeMoney(client, guildId, userId, tax, 'farm_electricity_tax');
  const paidFarm = getFarmState(paidUserData);
  for (const [item, qty] of Object.entries(info.recipe)) removeItem(paidFarm, item, qty);
  addItem(paidFarm, info.output, 1);
  await setEconomyData(client, guildId, userId, paidUserData);
  return { farm: paidFarm, userData: paidUserData, note: `⚙️ صنّعت 1× ${info.outputEmoji} ${info.outputLabel} من ${info.label}. ضريبة كهرباء: ${money(tax)}.` };
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
  let sellMultiplier = market;
  if (farm.buildings.includes('farmshop')) sellMultiplier *= 1.1;
  const total = Math.round(basePrice * qty * sellMultiplier);
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
      const { userData, farm, upkeepNotes } = await loadFarm(client, guildId, userId);
      await setEconomyData(client, guildId, userId, userData);

      const view = renderMain(farm, userData, upkeepNotes);
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
            const { userData: ud, farm: f, upkeepNotes: notes } = await loadFarm(client, guildId, userId);
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
            const view = views[section] || renderMain(f, ud, notes);
            if (section !== 'crops' && section !== 'animals' && notes.length) view.content = notes.map((n) => `⚠️ ${n}`).join('\n');
            await i.update(view);
            return;
          }

          if (i.isButton()) {
            const id = i.customId;

            if (id === 'farm_back') {
              const { userData: ud, farm: f, upkeepNotes: notes } = await loadFarm(client, guildId, userId);
              await setEconomyData(client, guildId, userId, ud);
              await i.update(renderMain(f, ud, notes));
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
            else if (id === 'farm_water_crops') result = await doWaterCrops(client, guildId, userId);
            else if (id === 'farm_protect_crops') result = await doProtectCrops(client, guildId, userId);
            else if (id.startsWith('farm_buyanimal_')) result = await doBuyAnimal(client, guildId, userId, id.replace('farm_buyanimal_', ''));
            else if (id === 'farm_collect') result = await doCollect(client, guildId, userId);
            else if (id === 'farm_care_animals') result = await doCareAnimals(client, guildId, userId);
            else if (id.startsWith('farm_build_')) result = await doBuild(client, guildId, userId, id.replace('farm_build_', ''));
            else if (id.startsWith('farm_hire_')) result = await doHire(client, guildId, userId, id.replace('farm_hire_', ''));
            else if (id.startsWith('farm_process_')) result = await doProcess(client, guildId, userId, id.replace('farm_process_', ''));

            if (result) {
              let view;
              const key = id.replace(/^farm_(plant|buyanimal|build|hire|process)_/, '');
              if (id.startsWith('farm_plant_') || id === 'farm_harvest' || id === 'farm_water_crops' || id === 'farm_protect_crops') view = renderCrops(result.farm);
              else if (id.startsWith('farm_buyanimal_') || id === 'farm_collect' || id === 'farm_care_animals') view = renderAnimals(result.farm);
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
