const app = require ('./app');
const connectDB = require ('./config/db');

connectDB ();

const PORT = process.env.PORT || 5000;

const server = app.listen (PORT, () => {
  console.log (
    `Server running in ${process.env.NODE_ENV} mode on port ${PORT}`
  );
});
