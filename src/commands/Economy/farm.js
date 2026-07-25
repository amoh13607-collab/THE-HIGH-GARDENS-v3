// src/commands/Economy/farm.js
//
// ============================================================================
// لعبة "إمبراطورية المزرعة الاقتصادية" — أمر Slash متكامل مع نظام الإيكونومي
// الحقيقي للبوت (EconomyService + utils/economy.js). العملة هي نفسها
// عملة wallet الحقيقية في السيرفر — ما في نظام عملة منفصل إطلاقاً.
// ============================================================================
//
// طريقة التثبيت:
//   1. حط هذا الملف في: src/commands/Economy/farm.js
//   2. لازم يتوفر بجانبه هذا الملفات (موجودة بالفعل عندك، ما نلمسها):
//        - src/services/economyService.js
//        - src/utils/economy.js
//   3. لو نظام تحميل الأوامر عندك (commandLoader.js) يتوقع export بشكل
//      مختلف عن { data, execute } (شكل discord.js v14 القياسي)، ابعثلي أول
//      10 أسطر من أي ملف أمر عندك (مثل work.js) وبعدّل التصدير بسرعة.
//
// كيف تُخزَّن بيانات المزرعة:
//   نستخدم getEconomyData/setEconomyData الموجودة أصلاً (نفس الدوال اللي
//   يستخدمها EconomyService لقراءة/حفظ wallet و bank). فقط نضيف حقل جديد
//   اسمه "farm" جوا نفس كائن بيانات اللاعب الاقتصادية. هذا يعني بيانات
//   المزرعة معزولة تلقائياً لكل سيرفر ولكل لاعب بنفس الطريقة تماماً.
//
// ============================================================================

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import EconomyService from '../../services/economyService.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';

const EMBED_COLOR = 0x1b5e20;
const LEVEL_UP_BASE = 200;

// ---------------------------------------------------------------------------
// تعريف بيانات اللعبة
// ---------------------------------------------------------------------------
const CROPS = {
  wheat: { label: 'قمح', growSeconds: 60, cost: 10, sell: 18 },
  corn: { label: 'ذرة', growSeconds: 90, cost: 15, sell: 26 },
  beans: { label: 'فاصوليا', growSeconds: 45, cost: 8, sell: 14 },
  carrot: { label: 'جزر', growSeconds: 40, cost: 7, sell: 12 },
  strawberry: { label: 'فراولة', growSeconds: 120, cost: 25, sell: 45 },
  grapes: { label: 'عنب', growSeconds: 150, cost: 30, sell: 55 }
};

const ANIMALS = {
  cow: { label: 'بقرة', cost: 200, product: 'milk', produceSeconds: 300 },
  chicken: { label: 'دجاجة', cost: 80, product: 'eggs', produceSeconds: 180 },
  sheep: { label: 'خروف', cost: 150, product: 'wool', produceSeconds: 420 },
  beehive: { label: 'خلية نحل', cost: 220, product: 'honey', produceSeconds: 360 }
};

const RAW_PRODUCT_SELL = { milk: 12, eggs: 8, wool: 20, honey: 25 };

const FACTORIES = {
  bakery: { label: 'مخبز', cost: 500, recipe: { wheat: 3 }, output: 'bread', outputSell: 30 },
  dairy: { label: 'معمل ألبان', cost: 600, recipe: { milk: 3 }, output: 'cheese', outputSell: 40 },
  juice_press: { label: 'معصرة عصائر', cost: 550, recipe: { grapes: 2, strawberry: 2 }, output: 'juice', outputSell: 50 },
  textile: { label: 'مصنع نسيج', cost: 700, recipe: { wool: 4 }, output: 'cloth', outputSell: 60 }
};

const REAL_ESTATE = {
  silo: { label: 'صومعة الغلال', cost: 1000 },
  farmshop: { label: 'سوق المزرعة', cost: 1500 },
  palace: { label: 'القصر الرئيسي', cost: 5000 },
  solar_plant: { label: 'محطة الطاقة الشمسية', cost: 3000 }
};

const WORKERS = {
  auto_harvester: { label: 'الحاصد الآلي', cost: 800 },
  guard_dog: { label: 'حارس المزرعة', cost: 300 },
  truck_driver: { label: 'سائق الشاحنة', cost: 600 }
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
// إدارة حالة المزرعة (مخزّنة جوا نفس بيانات الإيكونومي)
// ---------------------------------------------------------------------------
function getFarmState(userData) {
  if (!userData.farm) {
    userData.farm = {
      level: 1,
      exp: 0,
      inventory: {},
      plots: [],
      animals: {},
      buildings: [],
      workers: []
    };
  }
  return userData.farm;
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

function sellPrice(item) {
  if (CROPS[item]) return CROPS[item].sell;
  if (RAW_PRODUCT_SELL[item] != null) return RAW_PRODUCT_SELL[item];
  const factory = Object.values(FACTORIES).find((f) => f.output === item);
  if (factory) return factory.outputSell;
  return null;
}

function makeEmbed(title, description = '') {
  return new EmbedBuilder().setTitle(title).setDescription(description).setColor(EMBED_COLOR);
}

function errMsg(error) {
  return error?.userMessage || error?.message || 'حدث خطأ غير متوقع، حاول مرة ثانية.';
}

// ---------------------------------------------------------------------------
// تعريف الأمر (Slash Command)
// ---------------------------------------------------------------------------
export default {
  data: new SlashCommandBuilder()
    .setName('farm')
    .setDescription('لعبة إمبراطورية المزرعة الاقتصادية')
    .addSubcommand((sc) => sc.setName('status').setDescription('عرض حالة مزرعتك'))
    .addSubcommand((sc) =>
      sc
        .setName('plant')
        .setDescription('زراعة محصول')
        .addStringOption((o) =>
          o
            .setName('crop')
            .setDescription('نوع المحصول')
            .setRequired(true)
            .addChoices(...Object.entries(CROPS).map(([k, v]) => ({ name: v.label, value: k })))
        )
    )
    .addSubcommand((sc) => sc.setName('harvest').setDescription('حصاد المحاصيل الجاهزة'))
    .addSubcommand((sc) =>
      sc
        .setName('buy-animal')
        .setDescription('شراء حيوان')
        .addStringOption((o) =>
          o
            .setName('animal')
            .setDescription('نوع الحيوان')
            .setRequired(true)
            .addChoices(...Object.entries(ANIMALS).map(([k, v]) => ({ name: v.label, value: k })))
        )
    )
    .addSubcommand((sc) => sc.setName('collect').setDescription('جمع منتجات الحيوانات الجاهزة'))
    .addSubcommand((sc) =>
      sc
        .setName('build')
        .setDescription('بناء مصنع أو عقار أو عامل')
        .addStringOption((o) =>
          o
            .setName('structure')
            .setDescription('اسم المبنى')
            .setRequired(true)
            .addChoices(
              ...Object.entries(FACTORIES).map(([k, v]) => ({ name: v.label, value: k })),
              ...Object.entries(REAL_ESTATE).map(([k, v]) => ({ name: v.label, value: k })),
              ...Object.entries(WORKERS).map(([k, v]) => ({ name: v.label, value: k }))
            )
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName('process')
        .setDescription('تصنيع منتج من مواد خام عبر مصنع تملكه')
        .addStringOption((o) =>
          o
            .setName('factory')
            .setDescription('اسم المصنع')
            .setRequired(true)
            .addChoices(...Object.entries(FACTORIES).map(([k, v]) => ({ name: v.label, value: k })))
        )
    )
    .addSubcommand((sc) => sc.setName('inventory').setDescription('عرض مخزونك'))
    .addSubcommand((sc) =>
      sc
        .setName('sell')
        .setDescription('بيع عنصر من مخزونك')
        .addStringOption((o) => o.setName('item').setDescription('اسم العنصر').setRequired(true))
        .addIntegerOption((o) => o.setName('qty').setDescription('الكمية').setMinValue(1).setRequired(true))
    )
    .addSubcommand((sc) => sc.setName('market').setDescription('حالة السوق الحالية'))
    .addSubcommand((sc) => sc.setName('weather').setDescription('الطقس الحالي وتأثيره')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const client = interaction.client;

    try {
      switch (sub) {
        case 'status': {
          const userData = await getEconomyData(client, guildId, userId);
          const farm = getFarmState(userData);
          await setEconomyData(client, guildId, userId, userData);

          const weather = getCurrentWeather();
          const market = getMarketMultiplier();

          const embed = makeEmbed(`🌾 مزرعة ${interaction.user.username}`)
            .addFields(
              { name: 'المستوى', value: String(farm.level), inline: true },
              { name: 'الخبرة', value: `${farm.exp} / ${farm.level * LEVEL_UP_BASE}`, inline: true },
              { name: '💵 الرصيد', value: `$${(userData.wallet || 0).toLocaleString()}`, inline: true },
              { name: 'الطقس الحالي', value: weather.name, inline: true },
              {
                name: 'مضاعف السوق',
                value: `x${market}` + (market > 1.2 ? ' 📈 طفرة شرائية!' : ''),
                inline: true
              },
              { name: 'الحقول النشطة', value: farm.plots.length ? `${farm.plots.length} حقل` : 'لا يوجد', inline: true }
            );
          await interaction.reply({ embeds: [embed] });
          break;
        }

        case 'plant': {
          const crop = interaction.options.getString('crop');
          const info = CROPS[crop];

          const userDataBefore = await EconomyService.removeMoney(client, guildId, userId, info.cost, 'farm_plant');
          const farm = getFarmState(userDataBefore);

          const weather = getCurrentWeather();
          const growTime = info.growSeconds / weather.yieldMult;
          farm.plots.push({ crop, readyAt: Date.now() + growTime * 1000 });

          await setEconomyData(client, guildId, userId, userDataBefore);

          await interaction.reply({
            embeds: [
              makeEmbed(
                '🌱 تمت الزراعة!',
                `زرعت **${info.label}**. سيكون جاهزاً خلال ~${Math.round(growTime)} ثانية.\nالطقس الحالي (${weather.name}) أثّر على وقت النمو.`
              )
            ]
          });
          break;
        }

        case 'harvest': {
          const userData = await getEconomyData(client, guildId, userId);
          const farm = getFarmState(userData);
          const now = Date.now();
          const harvested = {};
          const remaining = [];

          for (const plot of farm.plots) {
            if (plot.readyAt <= now) {
              harvested[plot.crop] = (harvested[plot.crop] || 0) + 1;
            } else {
              remaining.push(plot);
            }
          }

          if (Object.keys(harvested).length === 0) {
            await interaction.reply({ embeds: [makeEmbed('⏳ لا يوجد شيء جاهز', 'لا توجد محاصيل جاهزة للحصاد بعد.')] });
            break;
          }

          for (const [crop, qty] of Object.entries(harvested)) addItem(farm, crop, qty);
          farm.plots = remaining;
          const totalQty = Object.values(harvested).reduce((a, b) => a + b, 0);
          const leveledUp = addFarmExp(farm, totalQty * 10);

          await setEconomyData(client, guildId, userId, userData);

          let desc = Object.entries(harvested)
            .map(([c, q]) => `${CROPS[c].label} × ${q}`)
            .join('\n');
          if (leveledUp) desc += `\n\n🎉 وصلت للمستوى **${farm.level}**!`;

          await interaction.reply({ embeds: [makeEmbed('🌾 نتائج الحصاد', desc)] });
          break;
        }

        case 'buy-animal': {
          const animal = interaction.options.getString('animal');
          const info = ANIMALS[animal];

          const userData = await EconomyService.removeMoney(client, guildId, userId, info.cost, 'farm_buy_animal');
          const farm = getFarmState(userData);

          if (!farm.animals[animal]) farm.animals[animal] = { count: 0, collectAt: 0 };
          farm.animals[animal].count += 1;
          if (farm.animals[animal].collectAt === 0) {
            farm.animals[animal].collectAt = Date.now() + info.produceSeconds * 1000;
          }

          await setEconomyData(client, guildId, userId, userData);

          await interaction.reply({
            embeds: [makeEmbed('🐣 تم الشراء!', `اشتريت **${info.label}**. الآن تملك ${farm.animals[animal].count} منه.`)]
          });
          break;
        }

        case 'collect': {
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
            await interaction.reply({ embeds: [makeEmbed('⏳ لا يوجد شيء جاهز', 'لا توجد منتجات جاهزة للجمع بعد.')] });
            break;
          }

          for (const [product, qty] of Object.entries(collected)) addItem(farm, product, qty);
          await setEconomyData(client, guildId, userId, userData);

          const desc = Object.entries(collected)
            .map(([p, q]) => `${p} × ${q}`)
            .join('\n');
          await interaction.reply({ embeds: [makeEmbed('🥚 تم جمع المنتجات', desc)] });
          break;
        }

        case 'build': {
          const structure = interaction.options.getString('structure');
          const info = FACTORIES[structure] || REAL_ESTATE[structure] || WORKERS[structure];
          const isFactory = !!FACTORIES[structure];
          const isWorker = !!WORKERS[structure];

          const userData = await getEconomyData(client, guildId, userId);
          const farm = getFarmState(userData);

          if (farm.buildings.includes(structure) || farm.workers.includes(structure)) {
            await interaction.reply({ embeds: [makeEmbed('⚠️ تملك هذا بالفعل', '')], ephemeral: true });
            break;
          }

          const paidData = await EconomyService.removeMoney(client, guildId, userId, info.cost, 'farm_build_' + structure);
          const farmAfterPay = getFarmState(paidData);

          if (isWorker) farmAfterPay.workers.push(structure);
          else farmAfterPay.buildings.push(structure);

          await setEconomyData(client, guildId, userId, paidData);

          await interaction.reply({ embeds: [makeEmbed('🏗️ تم البناء!', `أنشأت **${info.label}** بنجاح.`)] });
          break;
        }

        case 'process': {
          const factoryKey = interaction.options.getString('factory');
          const info = FACTORIES[factoryKey];

          const userData = await getEconomyData(client, guildId, userId);
          const farm = getFarmState(userData);

          if (!farm.buildings.includes(factoryKey)) {
            await interaction.reply({
              embeds: [makeEmbed('❌ لا تملك هذا المصنع', `لازم تبني ${info.label} أولاً (/farm build).`)],
              ephemeral: true
            });
            break;
          }

          for (const [item, qty] of Object.entries(info.recipe)) {
            if ((farm.inventory[item] || 0) < qty) {
              await interaction.reply({
                embeds: [makeEmbed('❌ مواد غير كافية', `تحتاج ${qty}× ${item} ولا تملك ما يكفي.`)],
                ephemeral: true
              });
              return;
            }
          }

          for (const [item, qty] of Object.entries(info.recipe)) removeItem(farm, item, qty);
          addItem(farm, info.output, 1);

          await setEconomyData(client, guildId, userId, userData);

          await interaction.reply({ embeds: [makeEmbed('⚙️ تمت المعالجة!', `حصلت على 1× **${info.output}** من ${info.label}.`)] });
          break;
        }

        case 'inventory': {
          const userData = await getEconomyData(client, guildId, userId);
          const farm = getFarmState(userData);
          await setEconomyData(client, guildId, userId, userData);

          if (Object.keys(farm.inventory).length === 0) {
            await interaction.reply({ embeds: [makeEmbed('📦 مخزونك', 'مخزونك فارغ حالياً.')] });
            break;
          }

          const desc = Object.entries(farm.inventory)
            .map(([item, qty]) => `${item}: ${qty}`)
            .join('\n');
          await interaction.reply({ embeds: [makeEmbed('📦 مخزونك', desc)] });
          break;
        }

        case 'sell': {
          const item = interaction.options.getString('item').toLowerCase();
          const qty = interaction.options.getInteger('qty');
          const basePrice = sellPrice(item);

          if (basePrice == null) {
            await interaction.reply({ embeds: [makeEmbed('❌ لا يمكن بيع هذا العنصر', '')], ephemeral: true });
            break;
          }

          const userData = await getEconomyData(client, guildId, userId);
          const farm = getFarmState(userData);

          if (!removeItem(farm, item, qty)) {
            await interaction.reply({ embeds: [makeEmbed('❌ الكمية غير كافية', 'لا تملك هذه الكمية في مخزونك.')], ephemeral: true });
            break;
          }
          await setEconomyData(client, guildId, userId, userData);

          const market = getMarketMultiplier();
          const total = Math.round(basePrice * qty * market);
          const finalData = await EconomyService.addMoney(client, guildId, userId, total, 'farm_sell_' + item);
          finalData.farm = farm;
          await setEconomyData(client, guildId, userId, finalData);

          let desc = `بعت ${qty}× ${item} مقابل $${total.toLocaleString()} (مضاعف السوق x${market})`;
          if (market > 1.2) desc += '\n📈 استفدت من طفرة شرائية!';
          await interaction.reply({ embeds: [makeEmbed('💰 تمت عملية البيع', desc)] });
          break;
        }

        case 'market': {
          const market = getMarketMultiplier();
          let desc = `المضاعف الحالي: x${market}`;
          if (market > 1.2) desc += '\n📈 **طفرة شرائية نشطة!** فرصة ممتازة للبيع الآن.';
          else if (market < 0.9) desc += '\n📉 السوق منخفض حالياً، يفضل الانتظار قبل البيع.';
          await interaction.reply({ embeds: [makeEmbed('📊 حالة السوق', desc)] });
          break;
        }

        case 'weather': {
          const w = getCurrentWeather();
          await interaction.reply({ embeds: [makeEmbed('🌤️ الطقس الحالي', `${w.name} — مضاعف الإنتاجية: x${w.yieldMult}`)] });
          break;
        }
      }
    } catch (error) {
      const message = errMsg(error);
      const embed = makeEmbed('❌ حدث خطأ', message);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [embed], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
  }
};
