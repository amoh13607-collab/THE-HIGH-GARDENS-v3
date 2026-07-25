// src/commands/Economy/farm.js
//
// ============================================================================
// لعبة "إمبراطورية المزرعة الاقتصادية" — لوحة تحكم واحدة (Embed + قائمة اختيار
// + أزرار) بنفس أسلوب لوحة الإيكونومي عندكم (economy_dashboard.js).
// أمر واحد فقط: /farm — كل شي داخل نفس الرسالة عبر Select Menu + أزرار.
// العملة = wallet الحقيقي (نفس EconomyService المستخدم في work.js/daily.js).
// ============================================================================
//
// التثبيت: انسخ هذا الملف مكان القديم في src/commands/Economy/farm.js تماماً
// (نفس المسار)، اعمل commit، وخلاص.
//
// ملاحظة عن سبب خطأ "/farm status" القديم: كان الكود يبني Embed بعدة حقول
// addFields() دفعة وحدة، وأي قيمة غير متوقعة (undefined/رقم فاسد) تخلي
// Discord API يرفض الطلب بخطأ عام "Received one or more errors". الكود
// الجديد يحمي كل قيمة برقم افتراضي آمن (Number(x) || 0) قبل عرضها.
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
  TextInputStyle
} from 'discord.js';
import EconomyService from '../../services/economyService.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';

const EMBED_COLOR = 0x1b5e20;
const LEVEL_UP_BASE = 200;
const SESSION_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// بيانات اللعبة
// ---------------------------------------------------------------------------
const CROPS = {
  wheat: { label: 'قمح', emoji: '🌾', growSeconds: 60, cost: 10, sell: 18 },
  corn: { label: 'ذرة', emoji: '🌽', growSeconds: 90, cost: 15, sell: 26 },
  beans: { label: 'فاصوليا', emoji: '🫘', growSeconds: 45, cost: 8, sell: 14 },
  carrot: { label: 'جزر', emoji: '🥕', growSeconds: 40, cost: 7, sell: 12 },
  strawberry: { label: 'فراولة', emoji: '🍓', growSeconds: 120, cost: 25, sell: 45 },
  grapes: { label: 'عنب', emoji: '🍇', growSeconds: 150, cost: 30, sell: 55 }
};

const ANIMALS = {
  cow: { label: 'بقرة', emoji: '🐄', cost: 200, product: 'milk', productLabel: 'حليب', produceSeconds: 300 },
  chicken: { label: 'دجاجة', emoji: '🐔', cost: 80, product: 'eggs', productLabel: 'بيض', produceSeconds: 180 },
  sheep: { label: 'خروف', emoji: '🐑', cost: 150, product: 'wool', productLabel: 'صوف', produceSeconds: 420 },
  beehive: { label: 'خلية نحل', emoji: '🐝', cost: 220, product: 'honey', productLabel: 'عسل', produceSeconds: 360 }
};

const RAW_PRODUCT_SELL = { milk: 12, eggs: 8, wool: 20, honey: 25 };
const RAW_PRODUCT_LABELS = { milk: 'حليب', eggs: 'بيض', wool: 'صوف', honey: 'عسل' };

const FACTORIES = {
  bakery: { label: 'مخبز', emoji: '🍞', cost: 500, recipe: { wheat: 3 }, output: 'bread', outputLabel: 'خبز', outputSell: 30 },
  dairy: { label: 'معمل ألبان', emoji: '🧀', cost: 600, recipe: { milk: 3 }, output: 'cheese', outputLabel: 'جبن', outputSell: 40 },
  juice_press: { label: 'معصرة عصائر', emoji: '🧃', cost: 550, recipe: { grapes: 2, strawberry: 2 }, output: 'juice', outputLabel: 'عصير', outputSell: 50 },
  textile: { label: 'مصنع نسيج', emoji: '🧵', cost: 700, recipe: { wool: 4 }, output: 'cloth', outputLabel: 'قماش', outputSell: 60 }
};

const REAL_ESTATE = {
  silo: { label: 'صومعة الغلال', emoji: '🏚️', cost: 1000, effect: 'زيادة سعة تخزين المحاصيل' },
  farmshop: { label: 'سوق المزرعة', emoji: '🏪', cost: 1500, effect: 'زيادة سعر بيع كل المنتجات 10%' },
  palace: { label: 'القصر الرئيسي', emoji: '🏰', cost: 5000, effect: 'مكانة ودخل يومي إضافي' },
  solar_plant: { label: 'محطة الطاقة الشمسية', emoji: '☀️', cost: 3000, effect: 'تخفيض تكلفة تشغيل المصانع 20%' }
};

const WORKERS = {
  auto_harvester: { label: 'الحاصد الآلي', emoji: '🤖', cost: 800, effect: 'حصاد تلقائي دوري' },
  guard_dog: { label: 'حارس المزرعة', emoji: '🐕', cost: 300, effect: 'حماية من السرقة' },
  truck_driver: { label: 'سائق الشاحنة', emoji: '🚚', cost: 600, effect: 'بيع تلقائي للفائض' }
};

const WEATHER_TYPES = [
  { name: '☀️ مشمس', yieldMult: 1.15 },
  { name: '⛅ غائم', yieldMult: 1.0 },
  { name: '🌧️ ممطر', yieldMult: 1.25 },
  { name: '🌵 جفاف', yieldMult: 0.7 },
  { name: '❄️ صقيع', yieldMult: 0.5 }
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
// حالة المزرعة (مخزّنة داخل نفس بيانات الإيكونومي الحقيقية تحت حقل farm)
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
  if (RAW_PRODUCT_LABELS[item]) return RAW_PRODUCT_LABELS[item];
  const f = Object.values(FACTORIES).find((x) => x.output === item);
  if (f) return f.outputLabel;
  return item;
}

function sellPrice(item) {
  if (CROPS[item]) return CROPS[item].sell;
  if (RAW_PRODUCT_SELL[item] != null) return RAW_PRODUCT_SELL[item];
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
    .setPlaceholder('اختر قسماً...')
    .addOptions(
      { label: 'المحاصيل', value: 'crops', emoji: '🌱', description: 'زراعة وحصاد المحاصيل' },
      { label: 'الحيوانات', value: 'animals', emoji: '🐄', description: 'شراء الحيوانات وجمع المنتجات' },
      { label: 'المصانع', value: 'factories', emoji: '🏭', description: 'بناء المصانع وتصنيع المنتجات' },
      { label: 'العقارات', value: 'realestate', emoji: '🏛️', description: 'أصول استراتيجية دائمة' },
      { label: 'العمال', value: 'workers', emoji: '👷', description: 'أتمتة وحماية المزرعة' },
      { label: 'المخزون والبيع', value: 'inventory', emoji: '📦', description: 'عرض مخزونك وبيع المنتجات' },
      { label: 'السوق والطقس', value: 'market', emoji: '📊', description: 'حالة السوق والطقس الحالية' },
      { label: 'كتيب التعليمات', value: 'help', emoji: '📖', description: 'شرح شامل لكل أنظمة اللعبة' }
    );
  return new ActionRowBuilder().addComponents(menu);
}

// ---------------------------------------------------------------------------
// عرض الأقسام
// ---------------------------------------------------------------------------
function renderMain(farm, userData) {
  const weather = getCurrentWeather();
  const market = getMarketMultiplier();
  const embed = new EmbedBuilder()
    .setTitle('🌾 إمبراطورية المزرعة الاقتصادية')
    .setDescription('اختر قسماً من القائمة تحت لإدارة مزرعتك.')
    .setColor(EMBED_COLOR)
    .addFields(
      { name: 'المستوى', value: String(farm.level), inline: true },
      { name: 'الخبرة', value: `${farm.exp} / ${farm.level * LEVEL_UP_BASE}`, inline: true },
      { name: '💵 الرصيد', value: money(userData.wallet), inline: true },
      { name: 'الطقس الحالي', value: weather.name, inline: true },
      { name: 'مضاعف السوق', value: `x${market}` + (market > 1.2 ? ' 📈' : ''), inline: true },
      { name: 'الحقول النشطة', value: farm.plots.length ? `${farm.plots.length} حقل` : 'لا يوجد', inline: true }
    )
    .setFooter({ text: 'تُغلق اللوحة تلقائياً بعد 10 دقائق من عدم الاستخدام.' });
  return { embeds: [embed], components: [mainMenuRow()] };
}

function renderCrops(farm) {
  const embed = new EmbedBuilder()
    .setTitle('🌱 المحاصيل')
    .setColor(EMBED_COLOR)
    .setDescription(
      Object.entries(CROPS)
        .map(([, c]) => `${c.emoji} **${c.label}** — تكلفة ${money(c.cost)} | بيع ${money(c.sell)} | نمو ~${c.growSeconds}ث`)
        .join('\n')
    );
  if (farm.plots.length) {
    embed.addFields({ name: 'حقولك الحالية', value: `${farm.plots.length} حقل مزروع (استخدم زر الحصاد)` });
  }

  const cropEntries = Object.entries(CROPS);
  const row1 = new ActionRowBuilder().addComponents(
    cropEntries.slice(0, 5).map(([key, c]) => new ButtonBuilder().setCustomId(`farm_plant_${key}`).setLabel(c.label).setEmoji(c.emoji).setStyle(ButtonStyle.Success))
  );
  const row2 = new ActionRowBuilder().addComponents(
    cropEntries.slice(5).map(([key, c]) => new ButtonBuilder().setCustomId(`farm_plant_${key}`).setLabel(c.label).setEmoji(c.emoji).setStyle(ButtonStyle.Success))
  );
  row2.addComponents(new ButtonBuilder().setCustomId('farm_harvest').setLabel('حصاد الكل').setEmoji('🌾').setStyle(ButtonStyle.Primary));
  row2.addComponents(new ButtonBuilder().setCustomId('farm_back').setLabel('رجوع').setStyle(ButtonStyle.Secondary));

  return { embeds: [embed], components: [row1, row2] };
}

function renderAnimals(farm) {
  const embed = new EmbedBuilder()
    .setTitle('🐄 الحيوانات')
    .setColor(EMBED_COLOR)
    .setDescription(
      Object.entries(ANIMALS)
        .map(
          ([key, a]) =>
            `${a.emoji} **${a.label}** — تكلفة ${money(a.cost)} | ينتج ${a.productLabel} كل ${a.produceSeconds}ث` +
            (farm.animals[key] ? ` | تملك: ${farm.animals[key].count}` : '')
        )
        .join('\n')
    );

  const animalEntries = Object.entries(ANIMALS);
  const row1 = new ActionRowBuilder().addComponents(
    animalEntries.map(([key, a]) => new ButtonBuilder().setCustomId(`farm_buyanimal_${key}`).setLabel(a.label).setEmoji(a.emoji).setStyle(ButtonStyle.Success))
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('farm_collect').setLabel('جمع المنتجات').setEmoji('🥚').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('farm_back').setLabel('رجوع').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

function renderFactories(farm) {
  const embed = new EmbedBuilder()
    .setTitle('🏭 المصانع')
    .setColor(EMBED_COLOR)
    .setDescription(
      Object.entries(FACTORIES)
        .map(([key, f]) => {
          const recipe = Object.entries(f.recipe).map(([i, q]) => `${q}× ${itemLabel(i)}`).join(' + ');
          const owned = farm.buildings.includes(key) ? ' ✅ مملوك' : ` | تكلفة البناء ${money(f.cost)}`;
          return `${f.emoji} **${f.label}** — الوصفة: ${recipe} ← ${f.outputLabel} (بيع ${money(f.outputSell)})${owned}`;
        })
        .join('\n')
    );

  const buttons = Object.entries(FACTORIES).map(([key, f]) => {
    const owned = farm.buildings.includes(key);
    return owned
      ? new ButtonBuilder().setCustomId(`farm_process_${key}`).setLabel(`تصنيع: ${f.label}`).setEmoji('⚙️').setStyle(ButtonStyle.Primary)
      : new ButtonBuilder().setCustomId(`farm_build_${key}`).setLabel(`بناء: ${f.label}`).setEmoji(f.emoji).setStyle(ButtonStyle.Success);
  });
  const row1 = new ActionRowBuilder().addComponents(buttons);
  const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('farm_back').setLabel('رجوع').setStyle(ButtonStyle.Secondary));

  return { embeds: [embed], components: [row1, row2] };
}

function renderRealEstate(farm) {
  const embed = new EmbedBuilder()
    .setTitle('🏛️ العقارات والأصول الاستراتيجية')
    .setColor(EMBED_COLOR)
    .setDescription(
      Object.entries(REAL_ESTATE)
        .map(([key, r]) => `${r.emoji} **${r.label}** — ${r.effect}` + (farm.buildings.includes(key) ? ' ✅ مملوك' : ` | ${money(r.cost)}`))
        .join('\n')
    );

  const buttons = Object.entries(REAL_ESTATE).map(([key, r]) => {
    const owned = farm.buildings.includes(key);
    return new ButtonBuilder()
      .setCustomId(`farm_build_${key}`)
      .setLabel(owned ? `✅ ${r.label}` : `بناء: ${r.label}`)
      .setEmoji(r.emoji)
      .setStyle(owned ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(owned);
  });
  const row1 = new ActionRowBuilder().addComponents(buttons);
  const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('farm_back').setLabel('رجوع').setStyle(ButtonStyle.Secondary));

  return { embeds: [embed], components: [row1, row2] };
}

function renderWorkers(farm) {
  const embed = new EmbedBuilder()
    .setTitle('👷 طاقم العمال')
    .setColor(EMBED_COLOR)
    .setDescription(
      Object.entries(WORKERS)
        .map(([key, w]) => `${w.emoji} **${w.label}** — ${w.effect}` + (farm.workers.includes(key) ? ' ✅ مملوك' : ` | ${money(w.cost)}`))
        .join('\n')
    );

  const buttons = Object.entries(WORKERS).map(([key, w]) => {
    const owned = farm.workers.includes(key);
    return new ButtonBuilder()
      .setCustomId(`farm_hire_${key}`)
      .setLabel(owned ? `✅ ${w.label}` : `تعيين: ${w.label}`)
      .setEmoji(w.emoji)
      .setStyle(owned ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(owned);
  });
  const row1 = new ActionRowBuilder().addComponents(buttons);
  const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('farm_back').setLabel('رجوع').setStyle(ButtonStyle.Secondary));

  return { embeds: [embed], components: [row1, row2] };
}

function renderInventory(farm) {
  const entries = Object.entries(farm.inventory);
  const desc = entries.length
    ? entries.map(([item, qty]) => `${itemLabel(item)}: **${qty}**` + (sellPrice(item) != null ? ` (بيع ${money(sellPrice(item))}/وحدة)` : '')).join('\n')
    : 'مخزونك فارغ حالياً.';

  const embed = new EmbedBuilder().setTitle('📦 مخزونك').setColor(EMBED_COLOR).setDescription(desc);
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('farm_sell').setLabel('بيع عنصر').setEmoji('💰').setStyle(ButtonStyle.Primary).setDisabled(entries.length === 0),
    new ButtonBuilder().setCustomId('farm_back').setLabel('رجوع').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1] };
}

function renderMarket() {
  const weather = getCurrentWeather();
  const market = getMarketMultiplier();
  let desc = `**الطقس الحالي:** ${weather.name} (مضاعف الإنتاجية x${weather.yieldMult})\n**مضاعف السوق:** x${market}`;
  if (market > 1.2) desc += '\n📈 **طفرة شرائية نشطة!** فرصة ممتازة للبيع الآن.';
  else if (market < 0.9) desc += '\n📉 السوق منخفض حالياً، يفضل الانتظار قبل البيع.';

  const embed = new EmbedBuilder().setTitle('📊 السوق والطقس').setColor(EMBED_COLOR).setDescription(desc);
  return { embeds: [embed], components: [backRow()] };
}

function renderHelp() {
  const embed = new EmbedBuilder()
    .setTitle('📖 كتيب تعليمات إمبراطورية المزرعة الاقتصادية')
    .setColor(EMBED_COLOR)
    .setDescription('دليل شامل لكل أنظمة اللعبة. العملة المستخدمة هي نفس رصيدك الحقيقي (wallet) في السيرفر.')
    .addFields(
      {
        name: '🧭 كيف تبدأ',
        value:
          '1. افتح `/farm` لعرض اللوحة الرئيسية.\n2. اختر قسم "المحاصيل" وازرع محصول رخيص مثل القمح.\n3. بعد انتهاء وقت النمو اضغط "حصاد الكل".\n4. بيع المحاصيل من قسم "المخزون والبيع" لتجميع رصيد.'
      },
      {
        name: '🌱 المحاصيل',
        value: Object.values(CROPS)
          .map((c) => `${c.emoji} ${c.label}: تكلفة ${money(c.cost)}، بيع ${money(c.sell)}، نمو ~${c.growSeconds}ث`)
          .join('\n')
      },
      {
        name: '🐄 الحيوانات',
        value: Object.values(ANIMALS)
          .map((a) => `${a.emoji} ${a.label}: تكلفة ${money(a.cost)}، ينتج ${a.productLabel} كل ${a.produceSeconds}ث`)
          .join('\n')
      },
      {
        name: '🏭 المصانع',
        value: Object.values(FACTORIES)
          .map((f) => {
            const recipe = Object.entries(f.recipe).map(([i, q]) => `${q}× ${itemLabel(i)}`).join(' + ');
            return `${f.emoji} ${f.label}: ${recipe} ← ${f.outputLabel} (تكلفة بناء ${money(f.cost)}، بيع ${money(f.outputSell)})`;
          })
          .join('\n')
      },
      {
        name: '🏛️ العقارات (شراء لمرة واحدة)',
        value: Object.values(REAL_ESTATE).map((r) => `${r.emoji} ${r.label}: ${r.effect} — ${money(r.cost)}`).join('\n')
      },
      {
        name: '👷 العمال (شراء لمرة واحدة)',
        value: Object.values(WORKERS).map((w) => `${w.emoji} ${w.label}: ${w.effect} — ${money(w.cost)}`).join('\n')
      },
      {
        name: '📈 نظام المستويات',
        value: 'تكسب خبرة عند الحصاد. عتبة الترقية = المستوى الحالي × 200 خبرة. كل ترقية تفتح تحدياً أصعب.'
      },
      {
        name: '📊 السوق والطقس',
        value:
          'الطقس يتغير عشوائياً ويؤثر على سرعة نمو المحاصيل (يمكن يسرّع أو يبطّئ النمو). مضاعف السوق يتغير كل 5 دقائق تقريباً، وإذا تجاوز 1.2 تكون هناك "طفرة شرائية" تزيد أرباح البيع.'
      },
      {
        name: '💰 العملة',
        value: 'كل عمليات الشراء والبيع تخصم/تضيف مباشرة من رصيدك الحقيقي (wallet) في نظام الإيكونومي بالسيرفر — نفس الرصيد المستخدم في daily وwork وbank.'
      }
    );

  return { embeds: [embed], components: [backRow()] };
}

// ---------------------------------------------------------------------------
// معالجة الأزرار (اقتصاديات + مخزون)
// ---------------------------------------------------------------------------
async function doPlant(client, guildId, userId, cropKey) {
  const info = CROPS[cropKey];
  const userData = await EconomyService.removeMoney(client, guildId, userId, info.cost, 'farm_plant');
  const farm = getFarmState(userData);
  const weather = getCurrentWeather();
  const growTime = info.growSeconds / weather.yieldMult;
  farm.plots.push({ crop: cropKey, readyAt: Date.now() + growTime * 1000 });
  await setEconomyData(client, guildId, userId, userData);
  return { farm, userData, note: `زرعت ${info.emoji} ${info.label}، جاهز خلال ~${Math.round(growTime)} ثانية.` };
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
  if (Object.keys(harvested).length === 0) {
    return { farm, userData, note: 'لا توجد محاصيل جاهزة للحصاد بعد.' };
  }
  for (const [crop, qty] of Object.entries(harvested)) addItem(farm, crop, qty);
  farm.plots = remaining;
  const total = Object.values(harvested).reduce((a, b) => a + b, 0);
  const leveledUp = addFarmExp(farm, total * 10);
  await setEconomyData(client, guildId, userId, userData);
  let note = Object.entries(harvested).map(([c, q]) => `${itemLabel(c)}×${q}`).join('، ');
  if (leveledUp) note += ` — 🎉 وصلت للمستوى ${farm.level}!`;
  return { farm, userData, note: `حصدت: ${note}` };
}

async function doBuyAnimal(client, guildId, userId, animalKey) {
  const info = ANIMALS[animalKey];
  const userData = await EconomyService.removeMoney(client, guildId, userId, info.cost, 'farm_buy_animal');
  const farm = getFarmState(userData);
  if (!farm.animals[animalKey]) farm.animals[animalKey] = { count: 0, collectAt: 0 };
  farm.animals[animalKey].count += 1;
  if (farm.animals[animalKey].collectAt === 0) farm.animals[animalKey].collectAt = Date.now() + info.produceSeconds * 1000;
  await setEconomyData(client, guildId, userId, userData);
  return { farm, userData, note: `اشتريت ${info.emoji} ${info.label}، الآن تملك ${farm.animals[animalKey].count}.` };
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
  if (Object.keys(collected).length === 0) {
    return { farm, userData, note: 'لا توجد منتجات جاهزة للجمع بعد.' };
  }
  for (const [product, qty] of Object.entries(collected)) addItem(farm, product, qty);
  await setEconomyData(client, guildId, userId, userData);
  const note = Object.entries(collected).map(([p, q]) => `${itemLabel(p)}×${q}`).join('، ');
  return { farm, userData, note: `جمعت: ${note}` };
}

async function doBuild(client, guildId, userId, key) {
  const info = FACTORIES[key] || REAL_ESTATE[key];
  const userData = await EconomyService.removeMoney(client, guildId, userId, info.cost, 'farm_build_' + key);
  const farm = getFarmState(userData);
  if (!farm.buildings.includes(key)) farm.buildings.push(key);
  await setEconomyData(client, guildId, userId, userData);
  return { farm, userData, note: `تم بناء ${info.label}!` };
}

async function doHire(client, guildId, userId, key) {
  const info = WORKERS[key];
  const userData = await EconomyService.removeMoney(client, guildId, userId, info.cost, 'farm_hire_' + key);
  const farm = getFarmState(userData);
  if (!farm.workers.includes(key)) farm.workers.push(key);
  await setEconomyData(client, guildId, userId, userData);
  return { farm, userData, note: `تم تعيين ${info.label}!` };
}

async function doProcess(client, guildId, userId, factoryKey) {
  const info = FACTORIES[factoryKey];
  const userData = await getEconomyData(client, guildId, userId);
  const farm = getFarmState(userData);
  if (!farm.buildings.includes(factoryKey)) {
    return { farm, userData, note: `تحتاج تبني ${info.label} أولاً.` };
  }
  for (const [item, qty] of Object.entries(info.recipe)) {
    if ((farm.inventory[item] || 0) < qty) {
      return { farm, userData, note: `تحتاج ${qty}× ${itemLabel(item)} ولا تملك ما يكفي.` };
    }
  }
  for (const [item, qty] of Object.entries(info.recipe)) removeItem(farm, item, qty);
  addItem(farm, info.output, 1);
  await setEconomyData(client, guildId, userId, userData);
  return { farm, userData, note: `صنّعت 1× ${info.outputLabel} من ${info.label}.` };
}

async function doSell(client, guildId, userId, itemRaw, qtyRaw) {
  const item = String(itemRaw || '').trim().toLowerCase();
  const qty = parseInt(qtyRaw, 10);

  if (!item || !Number.isInteger(qty) || qty <= 0) {
    return { note: 'أدخل اسم عنصر وكمية صحيحة.' };
  }
  const basePrice = sellPrice(item);
  if (basePrice == null) {
    return { note: `العنصر "${item}" غير قابل للبيع أو غير موجود.` };
  }

  const userData = await getEconomyData(client, guildId, userId);
  const farm = getFarmState(userData);
  if (!removeItem(farm, item, qty)) {
    return { farm, userData, note: `لا تملك ${qty}× ${itemLabel(item)} في مخزونك.` };
  }
  await setEconomyData(client, guildId, userId, userData);

  const market = getMarketMultiplier();
  const total = Math.round(basePrice * qty * market);
  const finalData = await EconomyService.addMoney(client, guildId, userId, total, 'farm_sell_' + item);
  finalData.farm = farm;
  await setEconomyData(client, guildId, userId, finalData);

  let note = `بعت ${qty}× ${itemLabel(item)} مقابل ${money(total)}`;
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
            await i.reply({ content: 'هذه اللوحة ليست لك، استخدم `/farm` بنفسك.', ephemeral: true });
            return;
          }

          // ---- قائمة الاختيار ----
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

          // ---- الأزرار ----
          if (i.isButton()) {
            const id = i.customId;

            if (id === 'farm_back') {
              const { userData: ud, farm: f } = await loadFarm(client, guildId, userId);
              await setEconomyData(client, guildId, userId, ud);
              await i.update(renderMain(f, ud));
              return;
            }

            if (id === 'farm_sell') {
              const modal = new ModalBuilder().setCustomId('farm_sell_modal').setTitle('بيع عنصر من المخزون');
              const itemInput = new TextInputBuilder()
                .setCustomId('farm_sell_item')
                .setLabel('اسم العنصر (بالإنجليزي مثل wheat)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);
              const qtyInput = new TextInputBuilder()
                .setCustomId('farm_sell_qty')
                .setLabel('الكمية')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);
              modal.addComponents(
                new ActionRowBuilder().addComponents(itemInput),
                new ActionRowBuilder().addComponents(qtyInput)
              );
              await i.showModal(modal);

              const submitted = await i
                .awaitModalSubmit({ filter: (m) => m.customId === 'farm_sell_modal' && m.user.id === userId, time: 60000 })
                .catch(() => null);
              if (!submitted) return;

              const itemVal = submitted.fields.getTextInputValue('farm_sell_item');
              const qtyVal = submitted.fields.getTextInputValue('farm_sell_qty');
              const result = await doSell(client, guildId, userId, itemVal, qtyVal);
              const view = renderInventory(result.farm || (await loadFarm(client, guildId, userId)).farm);
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
              if (id.startsWith('farm_plant_') || id === 'farm_harvest') view = renderCrops(result.farm);
              else if (id.startsWith('farm_buyanimal_') || id === 'farm_collect') view = renderAnimals(result.farm);
              else if (id.startsWith('farm_process_')) view = renderFactories(result.farm);
              else if (FACTORIES[id.replace('farm_build_', '')]) view = renderFactories(result.farm);
              else if (REAL_ESTATE[id.replace('farm_build_', '')]) view = renderRealEstate(result.farm);
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
