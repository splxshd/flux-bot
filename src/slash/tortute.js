'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');

const FINISH_GIF = 'https://tenor.com/en-GB/view/parasyte-throwing-anime-inichi-gif-12831094';

function makeBar(current, goal) {
  const totalBlocks = 10;
  const filled = Math.min(totalBlocks, Math.round((current / goal) * totalBlocks));
  return '▰'.repeat(filled) + '▱'.repeat(totalBlocks - filled);
}

function canModerate(interaction, targetMember) {
  if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) {
    return 'I need **Kick Members** permission to use this command.';
  }
  if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
    return 'You need **Kick Members** permission to use this command.';
  }
  if (targetMember.id === interaction.user.id) return 'You cannot torture yourself.';
  if (targetMember.id === interaction.client.user.id) return 'You cannot use this on me.';
  if (targetMember.id === interaction.guild.ownerId) return 'You cannot use this on the server owner.';
  if (
    interaction.member.id !== interaction.guild.ownerId &&
    targetMember.roles.highest.position >= interaction.member.roles.highest.position
  ) {
    return 'You cannot use this on someone with an equal or higher role than you.';
  }
  if (!targetMember.kickable) return 'I cannot kick this member. My role is probably too low.';
  return null;
}

function buildEmbed({ targetUser, executor, reason, count, goal, ended = false, cancelled = false }) {
  const percent = Math.min(100, Math.floor((count / goal) * 100));

  if (cancelled) {
    return new EmbedBuilder()
      .setColor(0x808080)
      .setTitle('🪨 Torture Cancelled')
      .setDescription(`The rock throwing against ${targetUser} has been cancelled.`)
      .setFooter({ text: `Cancelled by ${executor.tag}`, iconURL: executor.displayAvatarURL() })
      .setTimestamp();
  }

  if (ended) {
    return new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('💀 ROCK LIMIT REACHED')
      .setDescription(
        [
          `${targetUser} got hit by **${count}/${goal} rocks** and has been kicked.`,
          '',
          `**Reason:** ${reason}`,
          '',
          `\`${makeBar(count, goal)}\` **${percent}%**`,
        ].join('\n')
      )
      .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
      .setFooter({ text: `Started by ${executor.tag}`, iconURL: executor.displayAvatarURL() })
      .setTimestamp();
  }

  return new EmbedBuilder()
    .setColor(0xFEE75C)
    .setTitle('🪨 Public Stoning Has Begun')
    .setDescription(
      [
        `${targetUser} has been sentenced to the rock pit.`,
        '',
        `Press **🪨 Throw Rock** to throw one rock.`,
        `At **${goal} rocks**, the target gets kicked.`,
        '',
        `**Reason:** ${reason}`,
        '',
        `\`${makeBar(count, goal)}\` **${count}/${goal} rocks**`,
      ].join('\n')
    )
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .setFooter({ text: `Started by ${executor.tag}`, iconURL: executor.displayAvatarURL() })
    .setTimestamp();
}

function buildRows(count, goal, disabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('tortute:rock')
        .setLabel(`🪨 Throw Rock (${count}/${goal})`)
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId('tortute:cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
    ),
  ];
}

module.exports = [{
  data: new SlashCommandBuilder()
    .setName('tortute')
    .setDescription('Start a public rock vote. At the rock limit, the target gets kicked.')
    .addUserOption(option =>
      option.setName('target').setDescription('Member to throw rocks at').setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('rocks')
        .setDescription('How many rocks are needed before kick? Default: 10')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(50)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for the punishment')
        .setRequired(false)
        .setMaxLength(300)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('target');
    const goal = interaction.options.getInteger('rocks') ?? 10;
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    let targetMember;
    try {
      targetMember = await interaction.guild.members.fetch(targetUser.id);
    } catch {
      return interaction.reply({ content: '❌ I could not find that member in this server.', ephemeral: true });
    }

    const moderationError = canModerate(interaction, targetMember);
    if (moderationError) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('❌ Permission Denied').setDescription(moderationError)],
        ephemeral: true,
      });
    }

    let count = 0;
    let ended = false;
    const throwers = new Set();

    const message = await interaction.reply({
      embeds: [buildEmbed({ targetUser, executor: interaction.user, reason, count, goal })],
      components: buildRows(count, goal),
      fetchReply: true,
    });

    const collector = message.createMessageComponentCollector({ time: 10 * 60 * 1000 });

    collector.on('collect', async buttonInteraction => {
      try {
        if (ended) {
          return buttonInteraction.reply({ content: 'This torture session already ended.', ephemeral: true });
        }

        if (buttonInteraction.customId === 'tortute:cancel') {
          if (buttonInteraction.user.id !== interaction.user.id) {
            return buttonInteraction.reply({ content: 'Only the person who started this can cancel it.', ephemeral: true });
          }
          ended = true;
          collector.stop('cancelled');
          return buttonInteraction.update({
            embeds: [buildEmbed({ targetUser, executor: interaction.user, reason, count, goal, cancelled: true })],
            components: buildRows(count, goal, true),
          });
        }

        if (buttonInteraction.customId !== 'tortute:rock') return;

        if (buttonInteraction.user.id === targetUser.id) {
          return buttonInteraction.reply({ content: 'You cannot throw rocks at yourself.', ephemeral: true });
        }

        if (throwers.has(buttonInteraction.user.id)) {
          return buttonInteraction.reply({ content: 'You already threw your rock.', ephemeral: true });
        }

        throwers.add(buttonInteraction.user.id);
        count += 1;

        if (count >= goal) {
          ended = true;
          collector.stop('completed');

          await buttonInteraction.update({
            embeds: [buildEmbed({ targetUser, executor: interaction.user, reason, count, goal, ended: true })],
            components: buildRows(count, goal, true),
          });

          // Tenor URL as content = Discord auto-embeds it as an animated GIF
          await message.reply({
            content: `💀 ${targetUser} reached **${count}/${goal} rocks** and got kicked.\n${FINISH_GIF}`,
          });

          try {
            await targetMember.kick(`Tortute command by ${interaction.user.tag}: ${reason}`);
          } catch (err) {
            await message.reply(`❌ I tried to kick ${targetUser}, but it failed: \`${err.message}\``);
          }
          return;
        }

        return buttonInteraction.update({
          embeds: [buildEmbed({ targetUser, executor: interaction.user, reason, count, goal })],
          components: buildRows(count, goal),
        });
      } catch (err) {
        console.error('[tortute button error]', err);
        if (!buttonInteraction.replied && !buttonInteraction.deferred) {
          return buttonInteraction.reply({ content: '❌ Something went wrong, but the bot did not crash.', ephemeral: true });
        }
      }
    });

    collector.on('end', async (_collected, reasonEnded) => {
      if (ended) return;
      ended = true;
      try {
        await message.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(0x808080)
              .setTitle('🪨 Torture Expired')
              .setDescription(`${targetUser} survived with **${count}/${goal} rocks**.\nThe buttons expired.`)
              .setFooter({ text: `Started by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
              .setTimestamp(),
          ],
          components: buildRows(count, goal, true),
        });
      } catch (err) {
        console.error('[tortute collector end error]', err);
      }
    });
  },
}];
