const { Client, GatewayIntentBits, Partials, Events, REST, Routes, ChannelType, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const axios = require('axios');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel, Partials.Message]
});

let xpData = {};
try { xpData = JSON.parse(fs.readFileSync('./xp.json','utf8')); } catch { xpData = {}; }
const saveXP = () => fs.writeFileSync('./xp.json', JSON.stringify(xpData, null, 2));
const lastXP = new Map();

const NIVELES = [
  { name: 'Papoi', xp: 0 },
  { name: 'Papoi Activo', xp: 500 },
  { name: 'Papoi Fiel', xp: 1500 },
  { name: 'Papoi Veterano', xp: 5000 },
  { name: 'Papoi Leyenda', xp: 15000 },
];

const SOLO_HOIST = ['papoi mayor','moderador','booster papoi','papoi leyenda','papoi veterano','papoi fiel','papoi activo','papoi'];

function isOwner(id){ return id === process.env.OWNER_ID; }
function isMod(member){
  if(!member) return false;
  if(isOwner(member.id)) return true;
  return member.roles.cache.some(r => ['papoi mayor','moderador'].includes(r.name.toLowerCase()));
}

client.on(Events.ClientReady, async () => {
  const tiktokUser = process.env.TIKTOK_USERNAME || 'elcrisvideos';
  console.log(`✅ BotPapoi2026 FINAL 24/7 ONLINE como ${client.user.tag} | TikTok @${tiktokUser}`);
  const rest = new REST({version:'10'}).setToken(process.env.DISCORD_TOKEN);
  
  await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID), { body: [
    { name: 'separar-papois-exacto', description: 'Separa solo los 8 roles de Papois' },
    { name: 'rank', description: 'Ver tu XP y nivel', options: [{ name: 'usuario', description: 'Usuario a consultar', type: 6, required: false }] },
    { name: 'ban', description: 'Banear usuario del server', options: [{ name: 'usuario', description: 'Usuario a banear', type: 6, required: true }, { name: 'razon', description: 'Razón del baneo', type: 3, required: false }], default_member_permissions: PermissionFlagsBits.BanMembers.toString() },
    { name: 'kick', description: 'Expulsar usuario', options: [{ name: 'usuario', description: 'Usuario a expulsar', type: 6, required: true }, { name: 'razon', description: 'Razón', type: 3, required: false }], default_member_permissions: PermissionFlagsBits.KickMembers.toString() },
    { name: 'mute', description: 'Silenciar usuario temporalmente', options: [{ name: 'usuario', description: 'Usuario a silenciar', type: 6, required: true }, { name: 'minutos', description: 'Minutos de silencio', type: 4, required: true }, { name: 'razon', description: 'Razón del mute', type: 3, required: false }], default_member_permissions: PermissionFlagsBits.ModerateMembers.toString() },
    { name: 'unmute', description: 'Quitar silencio a usuario', options: [{ name: 'usuario', description: 'Usuario a desmutear', type: 6, required: true }], default_member_permissions: PermissionFlagsBits.ModerateMembers.toString() },
    { name: 'warn', description: 'Advertir a un usuario', options: [{ name: 'usuario', description: 'Usuario a advertir', type: 6, required: true }, { name: 'razon', description: 'Razón de la advertencia', type: 3, required: true }] },
    { name: 'clear', description: 'Borrar mensajes del canal', options: [{ name: 'cantidad', description: 'Cantidad de mensajes a borrar', type: 4, required: true }], default_member_permissions: PermissionFlagsBits.ManageMessages.toString() },
    { name: 'slowmode', description: 'Cambiar cooldown del canal', options: [{ name: 'segundos', description: 'Segundos de cooldown', type: 4, required: true }], default_member_permissions: PermissionFlagsBits.ManageChannels.toString() },
  ]});

  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if(guild){
    const general = guild.channels.cache.find(c => c.name.includes('general') && c.type === ChannelType.GuildText);
    if(general) await general.setRateLimitPerUser(10).catch(()=>{});
  }
  startTikTokMonitor();
  console.log('✅ Comandos registrados sin errores');
});

client.on(Events.GuildMemberAdd, async member => {
  const guild = member.guild;
  const rolPapoi = guild.roles.cache.find(r => r.name.toLowerCase() === 'papoi');
  if(rolPapoi) await member.roles.add(rolPapoi).catch(()=>{});
  const bienvenida = guild.channels.cache.find(c => c.name.includes('bienvenida'));
  if(bienvenida){
    const embed = new EmbedBuilder()
     .setColor(0xf1c40f)
     .setTitle(`👋 Bienvenido ${member.user.username} a Los Papois`)
     .setDescription(`Ya eres **Papoi**!\n\n📜 Lee las reglas\n💬 Preséntate en general\n⭐ Sube de nivel hablando.`)
     .setThumbnail(member.user.displayAvatarURL())
     .setTimestamp();
    bienvenida.send({ content: `${member}`, embeds: [embed] }).catch(()=>{});
  }
});

client.on(Events.MessageCreate, async msg => {
  if(!msg.guild || msg.author.bot) return;
  const member = msg.member;
  if(!member) return;

  if(!isOwner(msg.author.id)){
    const esMultimedia = msg.channel.name.toLowerCase().includes('multimedia');
    if(!esMultimedia && msg.attachments.size > 0){
      await msg.delete().catch(()=>{});
      const canalMulti = msg.guild.channels.cache.find(c=>c.name.includes('multimedia'));
      const warn = await msg.channel.send({ content: `${msg.author} ❌ Multimedia **solo** en ${canalMulti ? `<#${canalMulti.id}>` : '#multimedia'}` }).catch(()=>{});
      if(warn) setTimeout(()=>warn.delete().catch(()=>{}), 5000);
      return;
    }
  }

  if(!isMod(member)){
    const tieneLink = /(https?:\/\/|www\.|discord\.gg|discord\.com\/invite|t\.me\/)/i.test(msg.content);
    if(tieneLink){
      await msg.delete().catch(()=>{});
      const warn = await msg.channel.send({ content: `${msg.author} ❌ Links bloqueados.` }).catch(()=>{});
      if(warn) setTimeout(()=>warn.delete().catch(()=>{}), 4000);
      return;
    }
  }

  const ahora = Date.now();
  const ultimo = lastXP.get(msg.author.id) || 0;
  if(ahora - ultimo > 60000){
    const gana = Math.floor(Math.random()*11)+15;
    xpData[msg.author.id] = (xpData[msg.author.id]||0) + gana;
    lastXP.set(msg.author.id, ahora);
    saveXP();
    for(const nivel of NIVELES){
      if(xpData[msg.author.id] >= nivel.xp){
        const rol = msg.guild.roles.cache.find(r => r.name === nivel.name);
        if(rol &&!member.roles.cache.has(rol.id)){
          await member.roles.add(rol).catch(()=>{});
          if(nivel.xp > 0) msg.channel.send({ content: `🎉 ${msg.author} subió a **${nivel.name}**! (${xpData[msg.author.id]} XP)` }).then(m=>setTimeout(()=>m.delete().catch(()=>{}),8000)).catch(()=>{});
        }
      }
    }
  }
});

client.on(Events.InteractionCreate, async inter => {
  if(!inter.isChatInputCommand()) return;
  if(!isMod(inter.member) &&!['rank','separar-papois-exacto'].includes(inter.commandName)){
    return inter.reply({ content: '❌ Solo Moderador / Papoi Mayor', flags: 64 });
  }
  if(inter.commandName === 'separar-papois-exacto'){
    await inter.deferReply({ flags: 64 });
    for(const [id, rol] of inter.guild.roles.cache){
      if(rol.name === '@everyone' || rol.managed) continue;
      if(SOLO_HOIST.includes(rol.name.toLowerCase())) await rol.setHoist(true).catch(()=>{});
      else await rol.setHoist(false).catch(()=>{});
      await new Promise(r=>setTimeout(r,150));
    }
    return inter.editReply('✅ Solo los 8 Papois separados.');
  }
  if(inter.commandName === 'rank'){
    const user = inter.options.getUser('usuario') || inter.user;
    const xp = xpData[user.id]||0;
    let nivelActual = 'Papoi';
    for(const n of NIVELES) if(xp >= n.xp) nivelActual = n.name;
    return inter.reply({ content: `⭐ **${user.username}** - ${xp} XP - Nivel: **${nivelActual}**`, flags: 64 });
  }
  if(inter.commandName === 'ban'){
    const user = inter.options.getMember('usuario');
    const razon = inter.options.getString('razon')||'Sin razón';
    if(user) await user.ban({ reason: razon }).catch(()=>{});
    return inter.reply({ content: `🔨 Baneado ${user?.user.tag} - ${razon}` });
  }
  if(inter.commandName === 'kick'){
    const user = inter.options.getMember('usuario');
    const razon = inter.options.getString('razon')||'Sin razón';
    if(user) await user.kick(razon).catch(()=>{});
    return inter.reply({ content: `👢 Kick a ${user?.user.tag}` });
  }
  if(inter.commandName === 'mute'){
    const user = inter.options.getMember('usuario');
    const mins = inter.options.getInteger('minutos');
    const razon = inter.options.getString('razon')||'Silenciado';
    if(user) await user.timeout(mins*60*1000, razon).catch(()=>{});
    return inter.reply({ content: `🔇 ${user?.user.tag} muteado ${mins}m` });
  }
  if(inter.commandName === 'unmute'){
    const user = inter.options.getMember('usuario');
    if(user) await user.timeout(null).catch(()=>{});
    return inter.reply({ content: `🔊 ${user?.user.tag} desmuteado` });
  }
  if(inter.commandName === 'warn'){
    const user = inter.options.getUser('usuario');
    const razon = inter.options.getString('razon');
    const canal = inter.guild.channels.cache.find(c=>c.name.includes('general'));
    if(canal) canal.send({ content: `⚠️ ${user} advertencia: ${razon}` }).catch(()=>{});
    return inter.reply({ content: `⚠️ Warn a ${user.tag}`, flags: 64 });
  }
  if(inter.commandName === 'clear'){
    const cant = inter.options.getInteger('cantidad');
    await inter.channel.bulkDelete(cant, true).catch(()=>{});
    return inter.reply({ content: `🧹 Borrados ${cant} mensajes`, flags: 64 });
  }
  if(inter.commandName === 'slowmode'){
    const seg = inter.options.getInteger('segundos');
    await inter.channel.setRateLimitPerUser(seg).catch(()=>{});
    return inter.reply({ content: `⏳ Slowmode puesto a ${seg}s` });
  }
});

let lastVideoId = null;
let isLiveNow = false;
function startTikTokMonitor(){
  const tiktokUser = process.env.TIKTOK_USERNAME || 'elcrisvideos';
  console.log(`🎬 Monitor TikTok iniciado para @${tiktokUser} - revisando cada 60s`);
  
  setInterval(async () => {
    try{
      const guild = client.guilds.cache.get(process.env.GUILD_ID);
      if(!guild) return;

      // Checar video nuevo
      const res = await axios.get(`https://www.tikwm.com/api/user/posts?unique_id=${tiktokUser}&count=1`, { timeout: 10000 });
      const video = res.data?.data?.videos?.[0];
      if(video){
        if(lastVideoId === null){ lastVideoId = video.video_id; }
        else if(video.video_id !== lastVideoId){
          lastVideoId = video.video_id;
          const canalClips = guild.channels.cache.find(c => c.name.includes('clips-tiktok'));
          if(canalClips){
            const embed = new EmbedBuilder()
             .setColor(0x00f2ea)
             .setTitle(`🎬 Nuevo video de @${tiktokUser}!`)
             .setDescription(video.title || '¡Nuevo TikTok!')
             .setImage(video.cover)
             .setURL(`https://www.tiktok.com/@${tiktokUser}/video/${video.video_id}`)
             .setTimestamp();
            canalClips.send({ content: `@everyone`, embeds: [embed] }).catch(()=>{});
          }
        }
      }

      // Checar LIVE con tikwm info
      try{
        const infoRes = await axios.get(`https://www.tikwm.com/api/user/info?unique_id=${tiktokUser}`, { timeout: 10000 });
        const userInfo = infoRes.data?.data;
        const isLive = userInfo?.user?.is_live || userInfo?.is_live || false;
        if(isLive && !isLiveNow){
          isLiveNow = true;
          const canalLive = guild.channels.cache.find(c => c.name.includes('elcris-en-vivo'));
          if(canalLive){
            canalLive.send({ content: `🔴 **@everyone ELCRIS ESTÁ EN VIVO EN TIKTOK!**\nhttps://www.tiktok.com/@${tiktokUser}/live\n¡Vayan a apoyar!` }).catch(()=>{});
          }
        } else if(!isLive){
          isLiveNow = false;
        }
      }catch(e){}

    }catch(e){}
  }, 60000);
}

client.login(process.env.DISCORD_TOKEN);