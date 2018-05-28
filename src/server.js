import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import morgan from 'morgan';
import dotenv from 'dotenv';
import botkit from 'botkit';
import yelp from 'yelp-fusion';

/* eslint no-shadow:0 */

dotenv.config({ silent: true });
// initialize
const app = express();

// botkit controller
const controller = botkit.slackbot({
  debug: false,
});

// initialize slackbot
const slackbot = controller.spawn({
  token: process.env.SLACK_BOT_TOKEN,
  // this grabs the slack token we exported earlier
}).startRTM((err) => {
  // start the real time message client
  if (err) { throw new Error(err); }
});

const yelpClient = yelp.client(process.env.YELP_API_KEY);

// prepare webhook
// for now we won't use this but feel free to look up slack webhooks
controller.setupWebserver(process.env.PORT || 3001, (err, webserver) => {
  controller.createWebhookEndpoints(webserver, slackbot, () => {
    if (err) { throw new Error(err); }
  });
});


// example hello response
controller.hears(['hello', 'hi', 'howdy'], ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  bot.api.users.info({ user: message.user }, (err, res) => {
    if (res) {
      bot.reply(message, `Hello, ${res.user.name}!`);
    } else {
      bot.reply(message, 'Hello there!');
    }
  });
});

controller.hears(['hungry', 'food', 'lunch', 'dinner'], ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  bot.createConversation(message, (err, convo) => {
    let food = '';
    let userlocation = '';
    convo.addQuestion('Would you like food recomendations near you?', [
      {
        pattern: 'yes',
        callback(response, convo) {
          convo.gotoThread('yes_thread');
        },
      },
      {
        pattern: 'no',
        callback(response, convo) {
          convo.gotoThread('no_thread');
        },
      },
      {
        default: true,
        callback(response, convo) {
          convo.gotoThread('bad_response');
        },
      },
    ], {}, 'default');

    convo.addQuestion('Great! What type of food are you interested in?', (response, convo) => {
      food = response.text;
      bot.reply(message, `${food}? Sounds good!`);
      convo.gotoThread('location_thread');
    }, {}, 'yes_thread');

    convo.addQuestion('Where are you?', (response, convo) => {
      bot.reply(message, 'Ok! Pulling up the results...');

      userlocation = response.text;

      yelpClient.search({
        term: food,
        location: userlocation,
      }).then((res) => {
        let count = 0;
        res.jsonBody.businesses.forEach((business) => {
          if (count < 5) {
            const attachments = {

              attachments: [
                {
                  fallback: 'Here is a restaurant suggestion!',
                  title: business.name,
                  title_link: business.url,
                  text: `Rating: ${business.rating}/5\nReviews:${business.review_count}`,
                  color: '#7CD197',
                  image_url: business.image_url,

                },
              ],
            };

            bot.reply(message, attachments);
            count += 1;
          }

          // bot.reply(message, `${business.name} ${business.rating}/5. Link <${business.url}>`);
        });
      }).catch((e) => {
        console.log(e);
      });
      convo.next();
    }, {}, 'location_thread');

    convo.addMessage({
      text: 'Okay! Goodbye.',
    }, 'no_thread');

    convo.addMessage({
      text: 'Sorry, I did not understand.',
    }, 'bad_response');

    convo.activate();
  });
});

controller.hears(['help'], ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  bot.reply(message, 'Hey! I can help you find restaurants on Yelp. Just type "I\'m hungry" to get started!');
});

controller.on(['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  bot.reply(message, 'Huh?');
});

controller.on('outgoing_webhook', (bot, message) => {
  bot.replyPublic(message, 'hey! here');
});

// enable/disable cross origin resource sharing if necessary
app.use(cors());

// enable/disable http request logging
app.use(morgan('dev'));

// enable only if you want templating
app.set('view engine', 'ejs');

// enable only if you want static assets from folder static
app.use(express.static('static'));

// this just allows us to render ejs from the ../app/views directory
app.set('views', path.join(__dirname, '../src/views'));

// enable json message body for posting data to API
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// default index route
app.get('/', (req, res) => {
  res.send('hi');
});

// START THE SERVER
// =============================================================================
// const port = process.env.PORT || 9090;
// app.listen(port);
//
// console.log(`listening on: ${port}`);
