const Discord = require("discord.js");
const config = require("./config.json");
const fetch = require("node-fetch");
const client = new Discord.Client( {intents: ["GUILD_MEMBERS", "GUILD_MESSAGES", "GUILDS", "DIRECT_MESSAGES", "GUILD_VOICE_STATES"], partials: ["CHANNEL"]} );

//initialize

let settings = {}

client.on("ready", async function() {
    let response = await fetch('http://localhost:5001/get-settings', {
        method: "GET",
        headers: { 'Content-Type': 'application/json' } //should maybe handle bad responses
    })
    settings = await response.json()
})

//event handlers

client.on("createMessage", async function(message) {
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
    let messageArray = msgContent.toLowerCase().slice(prefix.length).split(" ")
    let command = messageArray[0]
    let params = messageArray.slice(1)

    //valid anywhere
    switch (command) {
        case "setcommandchannel":
            setCommandChannel(message)
            break;
        case "unsetcommandchannel":
            unsetCommandChannel(message)
            break;
        case "setlogchannel":
            setLogChannel(message)
            break;
        case "setwelcomechannel":
            setWelcomeChannel(message)
            break;
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
            break;
        case "setprefix":
            setPrefix(params, message)
            break;
        case "logmode":
            logMode(params, message)
            break;
        case "setwelcomemessage":
            setWelcomeMessage(params, message)
            break;
        case "unsetwelcomemessage":
            unsetWelcomeMessage(message)
            break;
    }
})

client.on("voiceStateUpdate", async function(oldMember, newMember) {
    let guildId = oldMember.guild.id
    let logMode = settings[guildId].logMode
    if (logMode==="off") return

    let logItem = null

    let voiceLog;
    
    if (logMode==="passive") voiceLog = await cleanUpVoiceLog(guildId)

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
        if (logMode==="passive") {
            voiceLog.push(logItem)
    
            await fetch(`http://localhost:5001/post-logs?guildId=${guildId}`, {
                method: "POST",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(voiceLog)
            })
        } else if (logMode==="live") {
            client.channels.fetch(settings[guildId].logChannelId).then(logChannel => {
                logChannel.send(logItemsToString([logItem]))
            }).catch(error => console.log(error))
        }
    }
})

client.on("guildMemberAdd", function(member) {
    let guildId = member.guild.id
    let welcomeMessage = settings[guildId].welcomeMessage
    let welcomeChannelId = settings[guildId].welcomeChannelId
    if (!welcomeMessage) return
    client.channels.fetch(welcomeChannelId).then(welcomeChannel => {
        welcomeChannel.send(welcomeMessage)
        .catch(error => console.log(error))
    })
});

// commands

//----universal commands

async function setCommandChannel(message) {
    let channelId = message.channel.id
    let guildId = message.guild.id
    if (settings[guildId].commandChannelId===channelId) {
        message.channel.send(`I was already listening for commands here in <#${channelId}>...`)
        return
    }
    settings[guildId].commandChannelId = channelId
    await updateSettings(settings)
    message.channel.send(`I will now only listen for commands here in <#${channelId}>!`)
    return
}

async function unsetCommandChannel(message) {
    let guildId = message.guild.id
    if (!settings[guildId].commandChannelId) {
        message.channel.send(`I didn't have a command channel set...`)
        return
    }
    settings[guildId].commandChannelId = null
    await updateSettings(settings)
    message.channel.send(`I will now listen for commands in all channels!`)
    return
}

async function setLogChannel(message) {
    let guildId = message.guild.id
    let channelId = message.channel.id
    if (settings[guildId].logMode!=="live") {
        message.channel.send(`Error: Can only set log channel when logmode is set to "live."`)
        return
    } else if (settings[guildId].logChannelId===channelId) {
        message.channel.send(`Log channel was already set to <#${channelId}>.`)
        return
    } else {
        settings[guildId].logChannelId = channelId
        await updateSettings(settings)
        message.channel.send(`I will now log voice channel activity here in <#${channelId}>!`)
        return
    }
}

async function setWelcomeChannel(message) {
    let guildId = message.guild.id
    let channelId = message.channel.id
    if (settings[guildId].welcomeChannelId===channelId) {
        message.channel.send(`Welcome channel was already set to <#${channelId}>.`)
        return
    } else {
        settings[guildId].welcomeChannelId = channelId
        await updateSettings(settings)
        message.channel.send(
            `I will now welcome new users here in <#${channelId}>! ` +
            `Please be sure to use "setwelcomemessage" command to set the message.`
        )
        return
    }
}

//----Restricted commands

function flip(message) {
    let roll = Math.random()
    if (roll < 0.5) message.channel.send("heads")
    else message.channel.send("tails")
}

async function log(params, message) {
    let guildId = message.guild.id
    let voiceLog = await cleanUpVoiceLog(guildId)

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
        } else if (rangeString.toLowerCase()==="all") range[1] = voiceLog.length
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

    if (params.length===0) sendThis = "Please roll at least one die..."
    for (let i=0; i<params.length; i++) {
        let numSides = Number(params[i])
        if (isNaN(numSides) || typeof(numSides)!=="number") {
            sendThis = "One or more dice has NaN sides..."
            break;
        } else if (numSides < 1 || numSides%1) {
            sendThis = "One or more dice has a non-whole number side..."
            break;
        }
        if (params.length > 1) sendThis += `**Roll ${i+1} (D${numSides})**: ${rollDie(numSides)}\n`
        else sendThis = rollDie(numSides)
    }

    message.channel.send(sendThis.toString())
}

function help(message) {
    message.channel.send(
        `Head here to see the list of commands: https://nelsong1997.github.io/gabebot/#help`
    )
}

async function setPrefix(params, message) {
    let oldPrefix = settings[message.guild.id].prefix
    let newPrefix = params[0]
    if (!newPrefix) {
        message.channel.send("Could not set prefix: No new prefix specified!")
        return
    } else if (oldPrefix===newPrefix) {
        message.channel.send(`Prefix was already set to ${oldPrefix}!`)
        return
    }
    let acceptableChars = "!$%^&"
    if (newPrefix.length > 2) {
        message.channel.send(`Could not set prefix: Prefixes longer than 2 chars not allowed`)
        return
    } else if (
        !acceptableChars.includes(newPrefix[0]) ||
        (newPrefix[1] &&
        !acceptableChars.includes(newPrefix[1]))
    ) {
        let charsArray = acceptableChars.split("")
        let charsString = charsArray.join(", ")
        message.channel.send(`Could not set prefix: Disallowed character used. Acceptable chars: ${charsString}`)
    } else {
        settings[message.guild.id].prefix = newPrefix
        await updateSettings(settings)
        message.channel.send(`Prefix set to "${newPrefix}"! Now your commands will look like: "${newPrefix}command"`)
    }
}

async function logMode(params, message) {
    let newLogMode = params[0]
    let validLogModes = ["off", "passive", "live"]
    let guildSettings = settings[message.guild.id]
    let logChannelId = guildSettings.logChannelId
    if (!newLogMode) {
        message.channel.send(`Current log mode: ${guildSettings.logMode}`)
        return
    }
    if (!validLogModes.includes(newLogMode)) return
    else if (newLogMode===guildSettings.logMode) {
        message.channel.send(`Log mode was already ${guildSettings.logMode}!`)
        return
    } else {
        if (newLogMode==="off") {
            message.channel.send("Voice logging disabled.")
        } else if (newLogMode==="passive") {
            message.channel.send("Voice logging enabled! Use the log command to display voice logs.")
        } else if (newLogMode==="live" && logChannelId) {
            client.channels.fetch(logChannelId).then(logChannel => {
                if (logChannel) {
                    message.channel.send(
                        "Voice logging enabled! Voice activity will be logged " +
                        `in <#${logChannelId}.`
                    )
                } else {
                    message.channel.send(
                        "Voice logging enabled, but the current voice log channel is invalid. " +
                        "Please set it again using setlogchannel."
                    )
                }
            })
        } else if (newLogMode==="live") {
            message.channel.send(
                "Voice logging enabled, but a channel needs to be set as the log channel. " +
                "Please use the command setlogchannel."
            )
        }
        settings[message.guild.id].logMode = newLogMode
        await updateSettings(settings)
    }

}

async function setWelcomeMessage(params, message) {
    let welcomeMessage = params.join(" ")
    let guildId = message.guild.id
    let welcomeChannelId = settings[guildId].welcomeChannelId
    if (welcomeChannelId) {
        client.channels.fetch(welcomeChannelId).then(welcomeChannel => {
            if (welcomeChannel) {
                message.channel.send("Welcome message updated! Posting it below...")
                message.channel.send(welcomeMessage)
            } else {
                message.channel.send(
                    "Welcome message updated, but the current welcome channel is invalid. " +
                    "Please use setwelcomechannel to update it. Posting welcome message below..."
                )
                message.channel.send(welcomeMessage)
            }
        })
    } else {
        message.channel.send(
            "Welcome message updated, but there is no welcome channel set. " +
            "Please use setwelcomechannel to set it. Posting welcome message below..."
        )
        message.channel.send(welcomeMessage)
    }
    settings[guildId].welcomeMessage = welcomeMessage
    await updateSettings(settings)
}

async function unsetWelcomeMessage(message) {
    let guildId = message.guild.id
    settings[guildId].welcomeMessage = null
    await updateSettings(settings)
    message.channel.send("Welcome message disabled.")
}

// misc funcs

async function cleanUpVoiceLog(guildId) {
    let getResponse = await fetch(`http://localhost:5001/get-logs?guildId=${guildId}`, {
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
    await fetch(`http://localhost:5001/post-logs?guildId=${guildId}`, {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(voiceLog)
    })

    return voiceLog
}

async function updateSettings(settingsObj) {
    let response = await fetch('http://localhost:5001/post-settings', {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsObj)
    })                              //should handle bad res
    return response
}

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

client.login(config.BOT_TOKEN);