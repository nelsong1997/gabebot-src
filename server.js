const express = require('express')
const app = express()
const port = process.env.PORT || 5000
const fs = require('fs')

app.get('/get-logs', (request, response) => {
  let guildId = request.query.guildId
  const data = fs.readFileSync(`./logs/${guildId}.json`);
  const json = JSON.parse(data);
  response.type('json').send(json)
})

app.post('/post-logs', express.json(), (request, response) => {
  let guildId = request.query.guildId
    fs.writeFileSync('./logs.json', );
    fs.writeFile(`./logs/${guildId}.json`, JSON.stringify(request.body), function(error) {
      if (error) throw error;
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