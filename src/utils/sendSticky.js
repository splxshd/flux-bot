'use strict';

const { EmbedBuilder } = require('discord.js');

/**
 * Parse embed tags from sticky content and send to channel.
 * Supports: {title:} {description:} {color:} {footer:} {thumbnail:} {image:} {author:}
 */
async function sendStickyContent(channel, sc) {
  const titleMatch  = sc.match(/\{title:\s*([^}]+)\}/i);
  const descMatch   = sc.match(/\{desc(?:ription)?:\s*([\s\S]+?)\}(?=\s*\{|$)/i);
  const colorMatch  = sc.match(/\{color:\s*#?([0-9a-fA-F]{6})\}/i);
  const footerMatch = sc.match(/\{footer:\s*([^}]+)\}/i);
  const thumbMatch  = sc.match(/\{thumbnail:\s*([^}]+)\}/i);
  const imageMatch  = sc.match(/\{image:\s*([^}]+)\}/i);
  const authorMatch = sc.match(/\{author:\s*([^}]+)\}/i);

  if (titleMatch || descMatch || colorMatch || footerMatch || thumbMatch || imageMatch || authorMatch) {
    const emb = new EmbedBuilder().setColor(colorMatch ? parseInt(colorMatch[1], 16) : 0x5865F2);
    if (titleMatch)  emb.setTitle(titleMatch[1].trim());
    if (descMatch)   emb.setDescription(descMatch[1].trim());
    if (footerMatch) emb.setFooter({ text: footerMatch[1].trim() });
    if (thumbMatch)  emb.setThumbnail(thumbMatch[1].trim());
    if (imageMatch)  emb.setImage(imageMatch[1].trim());
    if (authorMatch) emb.setAuthor({ name: authorMatch[1].trim() });
    if (!titleMatch && !descMatch) {
      const leftover = sc.replace(/\{[^}]+\}/g, '').trim();
      if (leftover) emb.setDescription(leftover.slice(0, 2000));
    }
    return channel.send({ embeds: [emb] }).catch(() => null);
  }

  return channel.send(sc).catch(() => null);
}

module.exports = { sendStickyContent };
