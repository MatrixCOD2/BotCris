require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Routes, SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const { REST } = require('@discordjs/rest');
const fs = require('fs');
const path = require('path');

// Reemplazá con tus datos
const TOKEN = "MTM2ODMyNDU3NzUzMjQ0NDY5Mw.Gd_Sch.CpUidpffdZzQn_67StCld7jMwBKQkeqa3X4CR8";
const CLIENT_ID = "1368324577532444693";
const CHANNEL_ID = "1364018070397518017";
const GUILD_ID = ''; // Para pruebas en servidor específico (opcional)

const formsFilePath = path.resolve('./forms.json');
let forms = {};

// Carga formularios del archivo JSON si existe
function loadForms() {
  if (fs.existsSync(formsFilePath)) {
    try {
      forms = JSON.parse(fs.readFileSync(formsFilePath, 'utf-8'));
    } catch {
      forms = {};
    }
  } else {
    forms = {};
  }
}

// Guarda formularios al archivo JSON
function saveForms() {
  fs.writeFileSync(formsFilePath, JSON.stringify(forms, null, 2));
}

// Cliente Discord
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

// Comandos slash
const commands = [
  new SlashCommandBuilder()
    .setName('crearformulario')
    .setDescription('Crea un formulario interactivo en un canal específico'),
  new SlashCommandBuilder()
    .setName('mostrar')
    .setDescription('Muestra un formulario guardado')
    .addStringOption(option =>
      option.setName('nombre')
        .setDescription('Nombre del formulario a mostrar')
        .setRequired(true))
].map(command => command.toJSON());

// Registro de comandos
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    if (GUILD_ID) {
      console.log('Registrando comandos en guild ' + GUILD_ID);
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    } else {
      console.log('Registrando comandos globales');
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    }
    console.log('Comandos registrados correctamente.');
  } catch (error) {
    console.error(error);
  }
}

// Espera respuesta del usuario
async function askQuestion(channel, userId, question, time = 300000) {
  await channel.send(`<@${userId}> ${question}`);
  try {
    const filter = m => m.author.id === userId && m.channel.id === channel.id;
    const collected = await channel.awaitMessages({ filter, max: 1, time, errors: ['time'] });
    return collected.first().content.trim();
  } catch {
    await channel.send(`<@${userId}> Tiempo agotado. Por favor, iniciá de nuevo con /crearformulario.`);
    return null;
  }
}

// /crearformulario
async function handleCrearFormulario(interaction) {
  const channel = await client.channels.fetch(CHANNEL_ID);
  const userId = interaction.user.id;

  await interaction.reply({ content: `Hola <@${userId}>, iniciarás la creación del formulario aquí.`, ephemeral: true });

  const formName = await askQuestion(channel, userId, '¿Cuál es el nombre del formulario? (Debe ser único)');
  if (!formName) return;

  if (forms[formName]) {
    await channel.send(`<@${userId}> Ya existe un formulario con ese nombre.`);
    return;
  }

  const numQuestionsStr = await askQuestion(channel, userId, '¿Cuántas preguntas tendrá el formulario? (Solo números)');
  if (!numQuestionsStr) return;

  const numQuestions = parseInt(numQuestionsStr, 10);
  if (isNaN(numQuestions) || numQuestions <= 0) {
    await channel.send(`<@${userId}> Número inválido. Reiniciá con /crearformulario.`);
    return;
  }

  const questions = [];
  for (let i = 0; i < numQuestions; i++) {
    const q = await askQuestion(channel, userId, `Escribí la pregunta #${i + 1}:`);
    if (!q) return;
    questions.push({ question: q, answer: null });
  }

  forms[formName] = questions;
  saveForms();

  await channel.send(`<@${userId}> Formulario "${formName}" creado con éxito. Usá /mostrar para verlo.`);
}

// /mostrar
async function handleMostrar(interaction) {
  const formName = interaction.options.getString('nombre');
  const channel = await client.channels.fetch(interaction.channelId);

  if (!forms[formName]) {
    await interaction.reply({ content: `No existe un formulario llamado "${formName}".`, ephemeral: true });
    return;
  }

  const questions = forms[formName];
  if (questions.length === 0) {
    await interaction.reply({ content: `El formulario "${formName}" no tiene preguntas.`, ephemeral: true });
    return;
  }

  const options = questions.map((q, idx) => ({
    label: `Pregunta ${idx + 1}`,
    description: q.question.length > 50 ? q.question.slice(0, 47) + '...' : q.question,
    value: idx.toString(),
  })).slice(0, 25);

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`form_select_${formName}`)
    .setPlaceholder('Seleccioná una pregunta')
    .addOptions(options);

  const actionRow = new ActionRowBuilder().addComponents(selectMenu);

  await interaction.reply({
    content: `Formulario: **${formName}**\nSeleccioná una pregunta para ver su respuesta (si está disponible).`,
    components: [actionRow],
    ephemeral: false,
  });
}

// Eventos
client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'crearformulario') {
      await handleCrearFormulario(interaction);
    } else if (interaction.commandName === 'mostrar') {
      await handleMostrar(interaction);
    }
  }

  if (interaction.isStringSelectMenu()) {
    const customId = interaction.customId;
    if (!customId.startsWith('form_select_')) return;
    const formName = customId.replace('form_select_', '');
    const questions = forms[formName];
    if (!questions) {
      await interaction.update({ content: `El formulario "${formName}" no existe.`, components: [], ephemeral: true });
      return;
    }

    const selectedIndex = parseInt(interaction.values[0], 10);
    if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= questions.length) {
      await interaction.update({ content: 'Selección inválida.', components: [], ephemeral: true });
      return;
    }

    const question = questions[selectedIndex].question;
    const answer = questions[selectedIndex].answer || '*No hay respuesta registrada aún*';

    const embed = new EmbedBuilder()
      .setTitle(`Pregunta #${selectedIndex + 1}`)
      .setDescription(question)
      .addFields({ name: 'Respuesta', value: answer })
      .setColor(0x00AE86);

    const actionRow = new ActionRowBuilder().addComponents(interaction.component);

    await interaction.update({ embeds: [embed], components: [actionRow], ephemeral: false });
  }
});

client.once('ready', () => {
  console.log('Bot listo:', client.user.tag);
  loadForms();
});

registerCommands();
client.login(TOKEN);

