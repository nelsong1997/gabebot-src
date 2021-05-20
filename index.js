const Discord = require("discord.js");
const config = require("./config.json");
const fetch = require("node-fetch");
const client = new Discord.Client();

//initialize

let settings = {}

client.on("ready", async function() {
    let response = await fetch('http://localhost:5000/get-settings', {
        method: "GET",
        headers: { 'Content-Type': 'application/json' } //should maybe handle bad responses
    })
    settings = await response.json()
})

//event handlers

client.on("message", async function(message) {
    if (message.author.bot) return;

    let guildId = message.guild.id
    let channelId = message.channel.id

    if (!settings[guildId]) {
        settings[guildId] = {
            prefix: "!",
            logMode: "off",
            logChannelId: null,
            welcomeMessage: null,
            welcomeChannelId: null,
            commandChannelId: null
        }

        await updateSettings(settings)
    }

    let guildSettings = settings[guildId]

    //consider returning same as help when bot is mentioned.

    //commands

    let msgContent = message.content
    let prefix = guildSettings.prefix
    if (!msgContent.startsWith(prefix)) return
    let messageArray = msgContent.toLowerCase().slice(1).split(" ")
    let command = messageArray[0]
    let params = messageArray.slice(1)

    //valid anywhere
    if (command==="setcommandchannel") {
        if (settings[guildId].commandChannelId===channelId) {
            message.channel.send(`I was already listening for commands here in <#${channelId}>...`)
            return
        }
        settings[guildId].commandChannelId = channelId
        await updateSettings(settings)
        message.channel.send(`I will now listen for commands here in <#${channelId}>!`)
        return
    }

    //valid only in designated channel
    if (channelId!==guildSettings.commandChannelId) return

    switch (command) {
        case "flip":
            flip(message)
            break;
        case "log":
            log(params, message)
            break;
        case "roll":
            roll(params, message)
            break;
        case "help":
            help(message)
    }
})

client.on("voiceStateUpdate", async function(oldMember, newMember) {
    let guildId = oldMember.guild.id
    if (settings[guildId].logMode==="off") return

    let logItem = null

    let voiceLog = await cleanUpVoiceLog()

    if (oldMember.channelID!==newMember.channelID) {
        logItem = {
            username: oldMember.guild.members.cache.get(oldMember.id).user.username,
            userId: oldMember.id,
            timeStamp: new Date()
        }
        if (oldMember.channelID===null) {
            logItem.changeType = 'join'
            logItem.newChannelName = newMember.guild.channels.cache.get(newMember.channelID).name
        } else if (newMember.channelID===null) {
            logItem.changeType = 'leave',
            logItem.oldChannelName = oldMember.guild.channels.cache.get(oldMember.channelID).name
        } else {
            logItem.changeType = 'move',
            logItem.oldChannelName = oldMember.guild.channels.cache.get(oldMember.channelID).name
            logItem.newChannelName = newMember.guild.channels.cache.get(newMember.channelID).name
        }
        voiceLog.push(logItem)

        await fetch('http://localhost:5000/post-logs', {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(voiceLog)
        })
    }
})

client.on("guildMemberAdd", function(member) {
    //allow user to set welcome message
});

// commands

function flip(message) {
    let roll = Math.random()
    if (roll < 0.5) message.channel.send("heads")
    else message.channel.send("tails")
}

async function log(params, message) {
    let voiceLog = await cleanUpVoiceLog()

    function logItemsToString(items) {
        function dateToString(dateString) {
            const date = new Date(dateString)
            let spaceyDate = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit'}) //9:03 AM
            let formattedDate = spaceyDate.split(" ").join("").toLowerCase() //9:03am
            return (
                `${formattedDate} ` +
                `on ${new Intl.DateTimeFormat('en-US', { weekday: "long" } ).format(date)}` //Saturday
            )
        }
        let logsString = ""
        for (let logItem of items) {
            switch (logItem.changeType) {
                case "join": logsString += 
                    `${logItem.username} joined **${logItem.newChannelName}** ` +
                    `at ${dateToString(logItem.timeStamp)}.\n`
                break;
                case "leave": logsString += 
                    `${logItem.username} left **${logItem.oldChannelName}** ` +
                    `at ${dateToString(logItem.timeStamp)}.\n`
                break;
                case "move": logsString += 
                    `${logItem.username} left **${logItem.oldChannelName}** and ` +
                    `joined **${logItem.newChannelName}** ` +
                    `at ${dateToString(logItem.timeStamp)}.\n`
            }
        }
        return logsString
    }

    let sendThis = ""

    voiceLog = voiceLog.reverse() //newest logs come first

    if (params[0]==="length") {
        message.channel.send(voiceLog.length)
        return
    }

    let range = [0, 5]
    let rangeString = params[1]
    let startDate = null
    let endDate = null

    if (!rangeString) rangeString = "5"
    else if (rangeString.includes(":")) { //time based
        let now = new Date()
        endDate = now
        startDate = new Date((Date.parse(now) - 86400000)) //24hrs ago
        function timeStrToDate(str, todaysDate) {
            let timeArray = str.split(":")
            let hour = Number(timeArray[0])
            let minuteStr = timeArray[1].slice(0, 2)
            let minute = Number(minuteStr)

            if (str.toLowerCase().includes("pm") && hour !== 12) hour += 12
            if (str.toLowerCase().includes("am") && hour === 12) hour -= 12
            if (
                (!hour && hour!==0) || hour < 0 || hour > 23 ||
                (!minute && minute!==0) || minute < 0 || minute > 59
            ) { return undefined }
            let goodDateString = hour + ":" + minuteStr + " " + todaysDate
            let returnDate = new Date(goodDateString)
            if (isNaN(returnDate)) return undefined //invalid date
            if (Date.parse(returnDate) > Date.now()) { //we got ahead of ourselves
                let badDateMs = Date.parse(returnDate)
                returnDate = new Date(badDateMs - 86400000)
            }
            return returnDate
        }

        let todayString = (now.getMonth() + 1) + "/" + now.getDate() + "/" + now.getFullYear()

        if (rangeString.includes("-")) {
            let timesArray = rangeString.split("-")
            startDate = timeStrToDate(timesArray[0], todayString)
            endDate = timeStrToDate(timesArray[1], todayString)
        } else if (rangeString.startsWith("before")) endDate = timeStrToDate(rangeString.slice(6), todayString)
        else if (rangeString.startsWith("after")) startDate = timeStrToDate(rangeString.slice(5), todayString)
        else {
            message.channel.send(`Error: Couldn't parse time specification (1)`)
            return
        }
        if (isNaN(startDate) || isNaN(endDate)) {
            message.channel.send(`Error: Couldn't parse time specification (2)`)
            return
        } else if (endDate < startDate) {
            message.channel.send(`Error: Start date is after end date`)
            return
        }
    } else { // index range
        if (rangeString.includes("-")) { 
        range = rangeString.split("-")
        range[0] = Number(range[0])
        range[1] = Number(range[1])
        } else if (rangeString.toLowerCase()==="all") range[1] = voiceLog.length //all ---------------------------FIX
        else range[1] = Number(rangeString) //nothing specified (gives 5 most recent)

        if (range[0] > range[1]) {
            message.channel.send("Error: Bad log range.")
            return
        }
    }
    
    //forming string based off of log command type (param[0]--all, peruser, user)
    if (params[0]==="all") { //!log all 5
        let logItems = []
        if (startDate) {
            for (let logItem of voiceLog) {
                let timeStamp = new Date(logItem.timeStamp)
                if (timeStamp > startDate && timeStamp < endDate) {
                    logItems.push(logItem)
                }
            }
        } else logItems = voiceLog.slice(range[0], range[1])
        sendThis = logItemsToString(logItems.reverse()) || "No logs :("
    } else if (params[0]==="peruser") {//!log peruser 5
        let uniqueUsers = []
        let logItems = []
        for (let i=0; i<voiceLog.length; i++) {
            let logItem = voiceLog[i]
            let timeStamp = new Date(logItem.timeStamp)
            if (startDate && (timeStamp < startDate || timeStamp > endDate)) continue
            let currentUserId = logItem.userId
            if (!uniqueUsers.includes(currentUserId)) {
                logItems.push(logItem)
                uniqueUsers.push(currentUserId)
                if (logItems.length >= range[1]) break
            }
        }
        logItems = logItems.slice(range[0])
        sendThis = logItemsToString(logItems.reverse()) || "No Logs :("
    } else if (params[0]==="user")  { //!log user 5 {id}
        let userId = params[2]
        let logItems = []
        for (let i=0; i<voiceLog.length; i++) {
            let logItem = voiceLog[i]
            let timeStamp = new Date(logItem.timeStamp)
            if (startDate && (timeStamp < startDate || timeStamp > endDate)) continue
            if (userId===logItem.userId) {
                logItems.push(logItem)
                if (logItems.length >= range[1]) break
            }
        }
        logItems = logItems.slice(range[0])
        sendThis = logItemsToString(logItems.reverse()) || "No Logs :("
    } else {
        message.channel.send(`Error: Invalid log type. Try "all", "peruser", or "user"`)
        return
    }
    if (sendThis.length > 2000) {
        message.channel.send(`Error: Too many logs (Char limit exceeded: ${sendThis.length}/2000)`)
        return
    }
    message.channel.send(sendThis)
}

function roll(params, message) {
    function rollDie(sides) { //inclusive
        return Math.floor(Math.random() * sides) + 1
    }

    let sendThis = ""

    for (let i=0; i<params.length; i++) {
        let numSides = params[i]
        if (params.length > 1) sendThis += `**Roll ${i+1} (D${numSides})**: ${rollDie(numSides)}\n`
        else sendThis = rollDie(numSides)
    }

    message.channel.send(sendThis)
}

function help(message) {
    message.channel.send(
        `Hi there! A list of available commands is below.
        \n` +
        `\`\`!flip\`\`\n` +
        `Flip a coin. returns "heads" or "tails"
        \n` +
        `\`\`!log [type] [range] [id]\`\`\n\n` +
        `ex.: !log all\n\n` +
        `View logs for when people join, leave and move between voice channels.\n` +
        `\`\`[type]\`\`: can be \`\`all\`\`, \`\`peruser\`\`, or \`\`user\`\`, or \`\`length\`\`. \`\`all\`\` shows all logs within the range. ` +
        `\`\`peruser\`\` only shows 1 log per distinct user. i.e. the last action each user performed. ` +
        `\`\`user\`\` shows logs for a specific user, determined by the user \`\`[id]\`\` provided at the end of the command. ` +
        `You can copy people's id's by enabling developer mode in advanced settings. \`\`length\`\` shows how many logs there are currently.\n` +
        `\`\`[range]\`\` (defaults to 5): If one number *x* is provided for the range, the most recent *x* logs will display. ` +
        `Otherwise a range of numbers or time specification can be used. Examples: 5-10, 14:00-15:00, before5:00pm, after1:23am\n` +
        `\`\`[id]\`\`: Specifies user id when using \`\`[type] = user\`\`.\n` +
        `Logs older than 24 hrs are deleted whenever voice state changes or a log command is used.
        \n` +
        `\`\`!roll [#sides] [#sides] [#sides]...\`\`\n\n` +
        `ex.: !roll 6 6\n\n` +
        `Roll a die or a bunch of dice. each die you want to roll is designated by its number of sides separated by spaces.
        \n` +
        `\`\`!help\`\`\n` +
        `Gives you this text!`
    )
}

// misc funcs

async function cleanUpVoiceLog() {
    let getResponse = await fetch('http://localhost:5000/get-logs', {
        method: "GET",
        headers: { 'Content-Type': 'application/json' } //should maybe handle bad responses
    })
    let voiceLog = await getResponse.json()

    let now = Date.now()
    for (let i=0; i<voiceLog.length; i++) {
        if (now - Date.parse(voiceLog[i].timeStamp) > 86400000) { //24 hrs
            voiceLog = voiceLog.slice(0, i).concat(voiceLog.slice(i + 1, voiceLog.length)) //del entry
            //could also wait till it's NOT too old and then delete all before.
        }
    }
    await fetch('http://localhost:5000/post-logs', {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(voiceLog)
    })

    return voiceLog
}

async function updateSettings(settingsObj) {
    let response = await fetch('http://localhost:5000/post-settings', {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsObj)
    })                              //should handle bad res
    return response
}

client.login(config.BOT_TOKEN);

//!help
//!roll