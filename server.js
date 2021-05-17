const express = require('express')
const app = express()
const port = process.env.PORT || 5000
const fs = require('fs')

app.get('/get-logs', (request, response) => {
  const data = fs.readFileSync('./logs.json');
  const json = JSON.parse(data);
  response.type('json').send(json)
})

app.post('/post-logs',
  express.json(),
  (request, response) => {
    fs.writeFileSync('./logs.json', JSON.stringify(request.body));
    response.status(201).send('Success')
})

app.listen(port, () => console.log(`Listening on port ${port}!`))