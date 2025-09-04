const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const users = require('./routes/v1/users');
const groups = require('./routes/v1/groups');
const friends = require('./routes/v1/friends');
const expenses = require('./routes/v1/expenses');
const loans = require('./routes/v1/loans');
const paymentMethods = require('./routes/v1/paymentMethods');

const expenses2 = require('./routes/v2/expenses');

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI, {
    dbName: 'splitmates',
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log("MongoDB Connected"))
    .catch((error) => console.error(error));

app.get('/', (req, res) => {
    res.status(200).send('🚀 Server is running!');
});

app.use('/api/v1/users', users);
app.use('/api/v1/groups', groups);
app.use('/api/v1/friends', friends);
app.use('/api/v1/expenses', expenses);
app.use('/api/v1/loans', loans);
app.use('/api/v1/paymentMethods', paymentMethods);

app.use('/api/v2/expenses', expenses2);
module.exports = app;
// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));