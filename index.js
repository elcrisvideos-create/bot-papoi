const { Client, GatewayIntentBits, Partials, Events, REST, Routes, ChannelType, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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

const PETS = {
  'Secreto': [
    'RazorFang','Centaur','Gargoyle','Pure Jellyfish','Mutant Shark','Stag','Cosmic Dragon','Cosmic Skeleton Boss','Tralaledon','TRex','Kraken','Cerberus','Yeti','King Snake'
  ],
  'Eterno': [
    'Skeleton Horse','Pegasus','Gorilla King','Oni Tiger','Eternal Lunar Dragon','Mosasaurus','El Maja','Lava Dragon','Phoenix','Ice Dragon'
  ],
  'Divino': [
    'World Burner','ArchAngel','Nightflame','Kitsune','Unicorn'
  ]
};
const ALL_PETS = [...PETS['Secreto'], ...PETS['Eterno'], ...PETS['Divino']];

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
    { name: 'setup-pets', description: 'Crear panel de ping-roles en este canal', default_member_permissions: PermissionFlagsBits.Administrator.toString() },
    { name: 'mis-pings', description: 'Ver qué notificaciones de pets tienes activas' },
    { name: 'crear-canal-ping-roles', description: 'Crea SOLO el canal #🔗 | ping-roles en la categoría ROBA UN HUEVO', default_member_permissions: PermissionFlagsBits.Administrator.toString() },
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

async function crearPanelPingRoles(channel){
  const guild = channel.guild;
  
  const embed = new EmbedBuilder()
    .setColor(0x00f2ea)
    .setTitle('🔗 | ping-roles — ¡Elige tus avisos!')
    .setDescription(
      `**¡Bienvenido a Ping Roles de PAPOIS EMPIRE!** 👋\n\n`+
      `Aquí eliges **exactamente** qué pets quieres que te avise el bot. Así no te llegan pings de todos los huevos, solo de los que TÚ quieras.\n\n`+
      `**¿Cómo se usa? (Súper fácil)**\n`+
      `**1.** Abre uno de los menús de abajo 👇\n`+
      `**2.** Marca los pets que te interesan (puedes marcar varios a la vez)\n`+
      `**3.** ¡Listo! Si ya tenías ese rol se te quita, si no lo tenías se te pone. Es como un interruptor 🔛🔜\n\n`+
      `**Categorías:**\n`+
      `🍀 **Huevo Secreto** — Pets secretos (14 disponibles)\n`+
      `🚀 **Huevo Eterno** — Pets eternos (10 disponibles)\n`+
      `💎 **Huevo Divino** — Pets divinos ULTRA raros (5 disponibles)\n\n`+
      `> 💡 *Ejemplo: Si solo quieres que te avise de \`Kitsune\` y \`Unicorn\`, solo marca esos 2 en Divino. Ya no te llegará spam de todos los demás.*\n\n`+
      `**Botones de ayuda:**\n`+
      `📋 **Mis Pings** — Mira qué avisos tienes ahora\n`+
      `✨ **Ayuda** — Vuelve a ver este mensaje`
    )
    .setThumbnail(guild.iconURL())
    .setImage('https://i.imgur.com/8Km9tLL.png')
    .setFooter({ text: 'PAPOIS EMPIRE • Cambios instantáneos • No afecta tus otros roles' })
    .setTimestamp();

  const rowSecreto = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('pets_Secreto')
      .setPlaceholder('🍀 Huevo Secreto — Elige tus pets específicos')
      .setMinValues(1)
      .setMaxValues(Math.min(PETS['Secreto'].length, 25))
      .addOptions(PETS['Secreto'].map(p => ({ label: p, value: p, description: `Solo te avisará de ${p}`, emoji: '🍀' })))
  );

  const rowEterno = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('pets_Eterno')
      .setPlaceholder('🚀 Huevo Eterno — Elige tus pets específicos')
      .setMinValues(1)
      .setMaxValues(Math.min(PETS['Eterno'].length, 25))
      .addOptions(PETS['Eterno'].map(p => ({ label: p, value: p, description: `Solo te avisará de ${p}`, emoji: '🚀' })))
  );

  const rowDivino = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('pets_Divino')
      .setPlaceholder('💎 Huevo Divino — Elige tus pets específicos')
      .setMinValues(1)
      .setMaxValues(Math.min(PETS['Divino'].length, 25))
      .addOptions(PETS['Divino'].map(p => ({ label: p, value: p, description: `Solo te avisará de ${p} • ULTRA RARO`, emoji: '💎' })))
  );

  const rowBotones = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_my_pings').setLabel('📋 Mis Pings').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_customize').setLabel('✨ Ayuda').setStyle(ButtonStyle.Success)
  );

  await channel.send({ embeds: [embed], components: [rowSecreto, rowEterno, rowDivino, rowBotones] });
}

client.on(Events.InteractionCreate, async inter => {
  if(inter.isButton()){
    if(inter.customId === 'btn_my_pings'){
      await inter.deferReply({ flags: 64 });
      const rolesPet = inter.member.roles.cache.filter(r => ALL_PETS.some(p => p.toLowerCase() === r.name.toLowerCase())).map(r => r.name);
      if(!rolesPet.length) return inter.editReply({ content: '📭 **No tienes ningún ping activo.**\nVe arriba y elige en los menús, por ejemplo `Kitsune` o `World Burner`.' });
      return inter.editReply({ content: `📋 **Tus pings activos (${rolesPet.length}):**\n${rolesPet.map(r => `• ${r}`).join('\n')}\n\nPara quitar uno, selecciónalo de nuevo en el menú.` });
    }
    if(inter.customId === 'btn_customize'){
      return inter.reply({ content: '👇 **Cómo usar:** Abre uno de los 3 menús de arriba y marca los pets que quieres. Puedes marcar varios a la vez. Si ya lo tenías, se te quitará.', flags: 64 });
    }
  }

  if(inter.isStringSelectMenu()){
    if(inter.customId.startsWith('pets_')){
      await inter.deferReply({ flags: 64 });
      const categoria = inter.customId.replace('pets_','');
      const seleccionados = inter.values;
      let agregados = [];
      let quitados = [];

      for(const petName of seleccionados){
        const rol = inter.guild.roles.cache.find(r => r.name.toLowerCase() === petName.toLowerCase());
        if(!rol) continue;
        if(inter.member.roles.cache.has(rol.id)){
          await inter.member.roles.remove(rol).catch(()=>{});
          quitados.push(petName);
        } else {
          await inter.member.roles.add(rol).catch(()=>{});
          agregados.push(petName);
        }
      }

      let msg = `**${categoria}**:\n`;
      if(agregados.length) msg += `✅ Ahora te avisará de: **${agregados.join(', ')}**\n`;
      if(quitados.length) msg += `❌ Ya NO te avisará de: **${quitados.join(', ')}**\n`;
      msg += `\nUsa 📋 Mis Pings para ver tu lista completa.`;
      return inter.editReply({ content: msg });
    }
  }

  if(!inter.isChatInputCommand()) return;

  if(inter.commandName === 'mis-pings'){
    await inter.deferReply({ flags: 64 });
    const rolesPet = inter.member.roles.cache.filter(r => ALL_PETS.some(p => p.toLowerCase() === r.name.toLowerCase())).map(r => r.name);
    if(!rolesPet.length) return inter.editReply({ content: '📭 No tienes pings activos. Ve a #🔗 | ping-roles y elige los pets que quieres.' });
    return inter.editReply({ content: `📋 **Tus pings (${rolesPet.length}):** ${rolesPet.join(', ')}` });
  }

  if(inter.commandName === 'crear-canal-ping-roles'){
    await inter.deferReply({ flags: 64 });
    const guild = inter.guild;
    
    // BUSCAR CATEGORIA EXACTA ROBA UN HUEVO
    let categoria = guild.channels.cache.find(c => 
      c.type === ChannelType.GuildCategory && 
      c.name.toLowerCase().includes('roba un huevo')
    );
    if(!categoria){
      categoria = guild.channels.cache.find(c => 
        c.type === ChannelType.GuildCategory && 
        (c.name.toLowerCase().includes('roba') || c.name.toLowerCase().includes('huevo'))
      );
    }

    if(!categoria){
      return inter.editReply({ content: '❌ No encontré la categoría `🥚 · ROBA UN HUEVO`. Créala primero o renombra la categoría existente para que contenga "ROBA UN HUEVO".' });
    }

    let canal = guild.channels.cache.find(c => c.name.toLowerCase().includes('ping-roles'));
    if(!canal){
      canal = await guild.channels.create({
        name: '🔗 | ping-roles',
        type: ChannelType.GuildText,
        parent: categoria.id,
        topic: 'Elige EXACTAMENTE qué pets quieres que te pingueen. Solo lectura.',
        permissionOverwrites: [
          { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.CreatePublicThreads] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory] },
        ]
      });
    } else {
      await canal.setParent(categoria.id).catch(()=>{});
      await canal.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: true, ReadMessageHistory: true, SendMessages: false, AddReactions: false, SendMessagesInThreads: false }).catch(()=>{});
      // Borrar mensajes viejos del bot para dejarlo limpio
      const msgs = await canal.messages.fetch({ limit: 10 }).catch(()=>null);
      if(msgs){
        for(const m of msgs.values()){
          if(m.author.id === client.user.id) await m.delete().catch(()=>{});
        }
      }
    }

    await crearPanelPingRoles(canal);
    return inter.editReply({ content: `✅ Canal creado/reparado: ${canal} dentro de **${categoria.name}**\nYa está en solo lectura y con el panel pro para niños y adultos.\n\nAhora ya puedes borrar la sección de "Que Notificacion de Huevos quieres recibir?" en Canales y roles.` });
  }

  if(!isMod(inter.member) &&!['rank','separar-papois-exacto','mis-pings'].includes(inter.commandName)){
    if(['setup-pets','crear-canal-ping-roles'].includes(inter.commandName)){
      if(!inter.memberPermissions.has(PermissionFlagsBits.Administrator) && !isMod(inter.member)){
        return inter.reply({ content: '❌ Solo Moderador / Papoi Mayor', flags: 64 });
      }
    } else {
      return inter.reply({ content: '❌ Solo Moderador / Papoi Mayor', flags: 64 });
    }
  }

  if(inter.commandName === 'setup-pets'){
    await inter.deferReply({ flags: 64 });
    await crearPanelPingRoles(inter.channel);
    return inter.editReply({ content: '✅ Panel pro creado aquí. Si no es #ping-roles, pon el canal en solo lectura.' });
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
    if(canal) canal.send({ content: `⚠ ${user} advertencia: ${razon}` }).catch(()=>{});
    return inter.reply({ content: `⚠ Warn a ${user.tag}`, flags: 64 });
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
