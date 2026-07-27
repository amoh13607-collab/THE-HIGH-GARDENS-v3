// src/commands/Leveling/levelconfig.js
//
// ============================================================================
// نظام المستويات الجديد — الجزء 3: أمر /levelconfig للإدارة، يتحكم بكل شي:
// شكل رسالة اللفل أب (إيمبد/نص)، الصورة، الروم، نص الرسالة، وتفعيل/تعطيل.
// ============================================================================

import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { getLevelingConfig, setLevelingConfig } from '../../utils/levelingStore.js';

const EMBED_COLOR = 0x1b5e20;

export default {
  data: new SlashCommandBuilder()
    .setName('levelconfig')
    .setDescription('إعدادات نظام المستويات (للإدارة فقط)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sc) =>
      sc
        .setName('mode')
        .setDescription('شكل رسالة اللفل أب')
        .addStringOption((o) =>
          o
            .setName('type')
            .setDescription('إيمبد أو نص عادي')
            .setRequired(true)
            .addChoices({ name: 'إيمبد', value: 'embed' }, { name: 'نص عادي', value: 'text' })
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName('image')
        .setDescription('تفعيل/تعطيل صورة اللفل أب')
        .addStringOption((o) =>
          o.setName('state').setDescription('تفعيل أو تعطيل').setRequired(true).addChoices({ name: 'تفعيل', value: 'on' }, { name: 'تعطيل', value: 'off' })
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName('channel')
        .setDescription('روم إعلانات اللفل أب')
        .addChannelOption((o) => o.setName('channel').setDescription('اتركه فارغاً لاستخدام نفس روم المحادثة').addChannelTypes(ChannelType.GuildText).setRequired(false))
    )
    .addSubcommand((sc) =>
      sc
        .setName('message')
        .setDescription('نص رسالة اللفل أب المخصص')
        .addStringOption((o) => o.setName('text').setDescription('استخدم {user} و {level} و {guild}').setRequired(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName('toggle')
        .setDescription('تفعيل/تعطيل نظام إعلانات اللفل أب كاملاً')
        .addStringOption((o) =>
          o.setName('state').setDescription('تفعيل أو تعطيل').setRequired(true).addChoices({ name: 'تفعيل', value: 'on' }, { name: 'تعطيل', value: 'off' })
        )
    )
    .addSubcommand((sc) => sc.setName('view').setDescription('عرض الإعدادات الحالية')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const client = interaction.client;

    try {
      if (sub === 'view') {
        const config = await getLevelingConfig(client, guildId);
        const embed = new EmbedBuilder()
          .setTitle('⚙️ إعدادات نظام المستويات')
          .setColor(EMBED_COLOR)
          .addFields(
            { name: 'الحالة', value: config.enabled ? '✅ مفعّل' : '❌ معطّل', inline: true },
            { name: 'الشكل', value: config.mode === 'embed' ? 'إيمبد' : 'نص عادي', inline: true },
            { name: 'الصورة', value: config.imageEnabled ? '✅ مفعّلة' : '❌ معطّلة', inline: true },
            { name: 'الروم', value: config.channelId ? `<#${config.channelId}>` : 'نفس روم المحادثة', inline: true },
            { name: 'نص الرسالة', value: config.message }
          );
        await interaction.reply({ embeds: [embed] });
        return;
      }

      if (sub === 'mode') {
        const type = interaction.options.getString('type');
        await setLevelingConfig(client, guildId, { mode: type });
        await interaction.reply(`✅ تم تغيير شكل رسالة اللفل أب إلى: **${type === 'embed' ? 'إيمبد' : 'نص عادي'}**`);
        return;
      }

      if (sub === 'image') {
        const state = interaction.options.getString('state') === 'on';
        await setLevelingConfig(client, guildId, { imageEnabled: state });
        await interaction.reply(`✅ تم ${state ? 'تفعيل' : 'تعطيل'} صورة اللفل أب.`);
        return;
      }

      if (sub === 'channel') {
        const channel = interaction.options.getChannel('channel');
        await setLevelingConfig(client, guildId, { channelId: channel ? channel.id : null });
        await interaction.reply(channel ? `✅ راح تُرسل رسائل اللفل أب في ${channel}.` : '✅ راح تُرسل رسائل اللفل أب بنفس روم المحادثة.');
        return;
      }

      if (sub === 'message') {
        const text = interaction.options.getString('text');
        await setLevelingConfig(client, guildId, { message: text });
        await interaction.reply('✅ تم تحديث نص رسالة اللفل أب.');
        return;
      }

      if (sub === 'toggle') {
        const state = interaction.options.getString('state') === 'on';
        await setLevelingConfig(client, guildId, { enabled: state });
        await interaction.reply(`✅ تم ${state ? 'تفعيل' : 'تعطيل'} نظام إعلانات اللفل أب.`);
        return;
      }
    } catch (error) {
      const msg = error?.userMessage || error?.message || 'حدث خطأ غير متوقع.';
      await interaction.reply({ content: `❌ ${msg}`, ephemeral: true });
    }
  }
};
