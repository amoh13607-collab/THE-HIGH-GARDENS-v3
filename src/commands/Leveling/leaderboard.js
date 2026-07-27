// src/commands/Leveling/leaderboard.js
//
// ============================================================================
// نظام المستويات الجديد — الجزء 4 (الأخير): ليدربورد مستويات مفصّل ومقسّم
// لصفحات (10 لكل صفحة) مع أزرار تنقل. يستخدم نفس آلية سحب البيانات
// المستخدمة بأمر eleaderboard.js الاقتصادي (client.db.list + client.db.get)
// — بس هنا يرتب حسب المستوى/الخبرة، مب الفلوس.
// ============================================================================

import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getEconomyPrefix } from '../../utils/database.js';
import { getLevelingState, totalAccumulatedXp } from '../../utils/levelingStore.js';

const EMBED_COLOR = 0x1b5e20;
const PAGE_SIZE = 10;
const RANK_EMOJI = ['🥇', '🥈', '🥉'];

async function fetchAllLevelData(client, guildId) {
  const prefix = getEconomyPrefix(guildId);
  let allKeys = await client.db.list(prefix);
  if (!Array.isArray(allKeys)) allKeys = [];

  const results = [];
  for (const key of allKeys) {
    const userId = key.replace(prefix, '');
    const userData = await client.db.get(key);
    if (!userData) continue;

    const levelState = getLevelingState(userData);
    if (levelState.level === 0 && levelState.xp === 0) continue; // تجاهل من ما له أي نشاط بعد

    results.push({
      userId,
      level: levelState.level,
      xp: levelState.xp,
      totalMessages: levelState.totalMessages || 0,
      totalXp: totalAccumulatedXp(levelState)
    });
  }

  results.sort((a, b) => b.totalXp - a.totalXp);
  return results;
}

function buildPageEmbed(entries, page, totalPages, guildName, requesterId) {
  const start = page * PAGE_SIZE;
  const pageEntries = entries.slice(start, start + PAGE_SIZE);

  const lines = pageEntries.map((e, i) => {
    const rank = start + i + 1;
    const medal = RANK_EMOJI[rank - 1] || `**#${rank}**`;
    return `${medal} <@${e.userId}> — المستوى **${e.level}** (${e.totalXp.toLocaleString()} XP، ${e.totalMessages.toLocaleString()} رسالة)`;
  });

  const myRank = entries.findIndex((e) => e.userId === requesterId) + 1;

  const embed = new EmbedBuilder()
    .setTitle(`🏆 ليدربورد المستويات — ${guildName}`)
    .setColor(EMBED_COLOR)
    .setDescription(lines.length ? lines.join('\n') : 'لا يوجد أعضاء نشطين بعد، ابدأ الدردشة لتظهر هنا!')
    .setFooter({ text: `صفحة ${page + 1} من ${totalPages}` + (myRank > 0 ? ` • ترتيبك: #${myRank}` : '') });

  return embed;
}

function buildRow(page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('lb_prev').setLabel('◀️ السابق').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId('lb_next').setLabel('التالي ▶️').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)
  );
}

export default {
  data: new SlashCommandBuilder().setName('leaderboard').setDescription('عرض ليدربورد المستويات في السيرفر'),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const entries = await fetchAllLevelData(interaction.client, interaction.guildId);
      const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
      let page = 0;

      const embed = buildPageEmbed(entries, page, totalPages, interaction.guild.name, interaction.user.id);
      const row = buildRow(page, totalPages);
      await interaction.editReply({ embeds: [embed], components: totalPages > 1 ? [row] : [] });

      if (totalPages <= 1) return;

      const message = await interaction.fetchReply();
      const collector = message.createMessageComponentCollector({ time: 5 * 60 * 1000 });

      collector.on('collect', async (i) => {
        if (i.user.id !== interaction.user.id) {
          await i.reply({ content: '🔒 بس اللي طلب الأمر يقدر يتصفح الصفحات.', ephemeral: true });
          return;
        }
        if (i.customId === 'lb_prev') page = Math.max(0, page - 1);
        if (i.customId === 'lb_next') page = Math.min(totalPages - 1, page + 1);

        const newEmbed = buildPageEmbed(entries, page, totalPages, interaction.guild.name, interaction.user.id);
        const newRow = buildRow(page, totalPages);
        await i.update({ embeds: [newEmbed], components: [newRow] });
      });

      collector.on('end', async () => {
        try {
          await interaction.editReply({ components: [] });
        } catch (_) {
          /* الرسالة قد تكون محذوفة أو منتهية الصلاحية */
        }
      });
    } catch (error) {
      const msg = error?.userMessage || error?.message || 'حدث خطأ غير متوقع.';
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: `❌ ${msg}`, embeds: [], components: [] });
      } else {
        await interaction.reply({ content: `❌ ${msg}`, ephemeral: true });
      }
    }
  }
};
