require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Routes, SlashCommandBuilder } = require('discord.js');
const { REST } = require('@discordjs/rest');

// Replace with your own Discord bot token and client ID (application ID) and optionally guild ID for testing
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
// For testing, you can specify a GUILD_ID to register commands only in one server (faster update)
// Otherwise leave empty or null to register globally (may take up to 1 hour to update)
const GUILD_ID = ''; // e.g. '123456789012345678'

const QUESTIONS_FILE = path.join(__dirname, 'questions.json');

let questions = [];
if (fs.existsSync(QUESTIONS_FILE)) {
  try {
    const data = fs.readFileSync(QUESTIONS_FILE, 'utf8');
    questions = JSON.parse(data);
  } catch (error) {
    console.error('Error loading questions:', error);
    questions = [];
  }
}

function saveQuestions() {
  fs.writeFileSync(QUESTIONS_FILE, JSON.stringify(questions, null, 2));
}

// Define commands
const commands = [
  new SlashCommandBuilder()
    .setName('addquestion')
    .setDescription('Añade una nueva pregunta')
    .addStringOption(option =>
      option.setName('texto')
        .setDescription('Texto de la pregunta')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('editquestion')
    .setDescription('Edita una pregunta existente')
    .addIntegerOption(option =>
      option.setName('id')
        .setDescription('ID de la pregunta a editar')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('texto')
        .setDescription('Nuevo texto de la pregunta')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('listquestions')
    .setDescription('Lista todas las preguntas'),

  new SlashCommandBuilder()
    .setName('getquestion')
    .setDescription('Obtiene una pregunta por su ID')
    .addIntegerOption(option =>
      option.setName('id')
        .setDescription('ID de la pregunta')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Muestra ayuda sobre los comandos del bot')
].map(command => command.toJSON());

// Register commands
const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
  try {
    console.log('Registrando comandos...');
    if (GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: commands }
      );
      console.log('Comandos registrados en el servidor específico.');
    } else {
      await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commands }
      );
      console.log('Comandos registrados globalmente.');
    }
  } catch (error) {
    console.error(error);
  }
}

registerCommands();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on('ready', () => {
  console.log(`Bot listo! Logueado como ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'addquestion') {
    const texto = interaction.options.getString('texto');
    const newId = questions.length > 0 ? questions[questions.length - 1].id + 1 : 1;
    questions.push({ id: newId, text: texto });
    saveQuestions();
    await interaction.reply(`Pregunta añadida con ID ${newId}.`);
  }

  else if (commandName === 'editquestion') {
    const id = interaction.options.getInteger('id');
    const texto = interaction.options.getString('texto');
    const index = questions.findIndex(q => q.id === id);
    if (index === -1) {
      await interaction.reply({ content: `No se encontró una pregunta con ID ${id}.`, ephemeral: true });
      return;
    }
    questions[index].text = texto;
    saveQuestions();
    await interaction.reply(`Pregunta con ID ${id} actualizada.`);
  }

  else if (commandName === 'listquestions') {
    if (questions.length === 0) {
      await interaction.reply('No hay preguntas almacenadas aún.');
      return;
    }
    // paginate if needed, but here we'll just send all if less than 1000 chars.
    const allQuestions = questions.map(q => `ID ${q.id}: ${q.text}`).join('\n');
    if (allQuestions.length > 1900) {
      await interaction.reply('Demasiadas preguntas para mostrar.');
    } else {
      await interaction.reply(`**Preguntas:**\n${allQuestions}`);
    }
  }

  else if (commandName === 'getquestion') {
    const id = interaction.options.getInteger('id');
    const question = questions.find(q => q.id === id);
    if (!question) {
      await interaction.reply({ content: `No se encontró una pregunta con ID ${id}.`, ephemeral: true });
      return;
    }
    await interaction.reply(`Pregunta ID ${id}: ${question.text}`);
  }

  else if (commandName === 'help') {
    await interaction.reply(
      '**Comandos del bot de preguntas:**\n' +
      '/addquestion <texto> - Añade una nueva pregunta\n' +
      '/editquestion <id> <nuevo texto> - Edita una pregunta existente\n' +
      '/listquestions - Lista todas las preguntas\n' +
      '/getquestion <id> - Obtiene una pregunta por su ID\n' +
      '/help - Muestra este mensaje de ayuda'
    );
  }

});

client.login(TOKEN);
