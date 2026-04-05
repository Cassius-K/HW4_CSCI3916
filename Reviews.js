var mongoose = require('mongoose');
var Schema = mongoose.Schema;

mongoose.connect(process.env.DB);

const ReviewSchema = new mongoose.Schema({
    movieId: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie' },
    username: String,
    content: String,
    rating: { type: Number, min: 0, max: 5 }
  });

// return the model
module.exports = mongoose.model('Review', ReviewSchema);
