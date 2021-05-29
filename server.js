const express = require('express')
const app = express()
const port = process.env.PORT || 5001
const fs = require('fs')

app.get('/get-logs', (request, response) => {
  let guildId = request.query.guildId
  fs.readFile(`./logs/${guildId}.json`, (err, data) => {
    if (err && (err.errno===-4058 || err.errno===-2)) { //no such file or directory; win || linux
      fs.writeFile(`./logs/${guildId}.json`, "[]", function(error) { //create new file
        if (error) {
          console.log("bad post (1)", error)
        }
        else response.type('json').send('[]') //return empty logs
      })
    } else if (err) { //unpredicted error
      console.log("bad get", err)
      return
    } else { //if the log file already exists
      const json = JSON.parse(data);
      response.type('json').send(json)
    }
  })
})

app.post('/post-logs', express.json(), (request, response) => {
  let guildId = request.query.guildId
    fs.writeFile(`./logs/${guildId}.json`, JSON.stringify(request.body), function(error) {
      if (error) {
        console.log("bad post (2)", error)
      }
      else response.status(201).send('Success')
    })
})

app.get('/get-settings', (request, response) => {
  const data = fs.readFileSync('./settings.json');
  const json = JSON.parse(data);
  response.type('json').send(json)
})

app.post('/post-settings',
  express.json(),
  (request, response) => {
    fs.writeFileSync('./settings.json', JSON.stringify(request.body));
    response.status(201).send('Success')
})

app.listen(port, () => console.log(`Listening on port ${port}!`))