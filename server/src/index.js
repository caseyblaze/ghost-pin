const express = require('express');
const { createPmd } = require('./pmd');
const { createRoutes } = require('./routes');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());
app.use(createRoutes(createPmd()));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Ghost-Pin server listening on http://0.0.0.0:${PORT}`);
});
