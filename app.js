const express = require("express");
const sqlite3 = require("sqlite3");
const path = require("path");
const { open } = require("sqlite");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();

app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDbAndSever = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndSever();

/*const getTweetDetails = (tweet) => {
  return {
    "tweet": tweet.tweet,
    "likes": tweet.likes,
    "replies": tweet.replies,
    "dateTime": tweet.dateTime,
  }
};*/

const likedUserArray = (likes) => {
  let array = [];

  likes.forEach((user) => array.push(user.name));
  return { likes: array };
};

const replyConversion = (reply) => {
  let array = [];

  reply.forEach((user) => array.push({ name: user.name, reply: user.reply }));
  return { replies: array };
};

const authenticationToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
    if (jwtToken === undefined) {
      response.status(401);
      response.send("Invalid JWT Token");
    } else {
      jwt.verify(jwtToken, "my_token", async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = payload.username;
          request.user_id = payload.user_id;
          next();
        }
      });
    }
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const existUserQuery = `
    SELECT 
        *
    FROM 
        user
    WHERE 
        username LIKE '${username}';`;
  const existUser = await db.get(existUserQuery);
  if (existUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const addUserQuery = `
            INSERT INTO 
                user (name,username,password,gender)
            VALUES (
                '${name}',
                '${username}',
                '${hashedPassword}',
                '${gender}'
                );`;
      await db.run(addUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `
    SELECT 
        *
    FROM 
        user
    WHERE 
        username = '${username}';`;
  const dbUser = await db.get(getUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPassword = await bcrypt.compare(password, dbUser.password);
    if (isPassword === true) {
      const payload = { user_id: dbUser.user_id, username: username };
      const jwtToken = jwt.sign(payload, "my_token");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get(
  "/user/tweets/feed/",
  authenticationToken,
  async (request, response) => {
    const { user_id, username } = request;
    const getUserQuery = `
    SELECT 
        following_user_id 
    FROM follower 
    WHERE 
        follower_user_id = ${user_id};`;
    const userFollowingId = await db.all(getUserQuery);
    const array = userFollowingId.map((each) => each.following_user_id);

    const getFeedQuery = `
    SELECT 
        user.username,
        tweet.tweet,
        tweet.date_time as dateTime
    FROM user
    INNER JOIN tweet ON user.user_id = tweet.user_id
    WHERE 
        user.user_id IN (${array})
    ORDER BY 
        tweet.date_time DESC
    LIMIT 4;`;
    const feedQuery = await db.all(getFeedQuery);
    response.send(feedQuery);
  }
);

app.get("/user/following/", authenticationToken, async (request, response) => {
  const { user_id, username } = request;
  const getUserQuery = `
    SELECT 
        following_user_id
    FROM 
        follower
    WHERE 
        follower_user_id = ${user_id};`;
  const followingArray = await db.all(getUserQuery);
  const array = followingArray.map((each) => each.following_user_id);

  const getListQuery = `
  SELECT 
    name
  FROM 
    user
  WHERE 
    user_id IN (${array});`;
  const getListFollowing = await db.all(getListQuery);
  response.send(getListFollowing);
});

app.get("/user/followers/", authenticationToken, async (request, response) => {
  const { user_id, username } = request;
  const getUserQuery = `
    SELECT 
        follower_user_id
    FROM 
        follower
    WHERE 
        following_user_id LIKE ${user_id};`;
  const followingArray = await db.all(getUserQuery);
  const array = followingArray.map((each) => each.follower_user_id);

  const getFollowerQuery = `
    SELECT 
        name
    FROM 
        user
    WHERE 
         user_id IN (${array});`;
  const followerList = await db.all(getFollowerQuery);
  response.send(followerList);
});

app.get("/tweets/:tweetId/", authenticationToken, async (request, response) => {
  const { user_id } = request;
  const { tweetId } = request.params;
  const getFollowingQuery = `
  SELECT 
  following_user_id
  FROM follower
  WHERE 
    follower_user_id LIKE ${user_id};`;
  const followingQuery = await db.all(getFollowingQuery);
  const followingList = followingQuery.map((each) => each.following_user_id);

  const getTweetQuery = `
  SELECT 
    tweet_id
  FROM 
    tweet 
  WHERE 
    user_id IN (${followingList});`;
  const tweetQuery = await db.all(getTweetQuery);
  const tweetList = tweetQuery.map((each) => each.tweet_id);
  if (tweetList.includes(parseInt(tweetId))) {
    //like_id  or user_id
    const getLikesQuery = `
        SELECT 
            count(like_id) AS like_count
        FROM 
            like
        WHERE 
            tweet_id LIKE ${tweetId};`;
    const totalLikeData = await db.get(getLikesQuery);

    const getTweetQuery = `
        SELECT 
            tweet,
            date_time
        FROM 
            tweet
        WHERE 
            tweet_id LIKE ${tweetId};`;
    const tweetData = await db.get(getTweetQuery);

    const getRepliesQuery = `
        SELECT 
            count(reply) AS count_replies
        FROM 
            reply
        WHERE 
            tweet_id LIKE ${tweetId};`;
    const replyData = await db.get(getRepliesQuery);

    response.send({
      tweet: tweetData.tweet,
      likes: totalLikeData.like_count,
      replies: replyData.count_replies,
      dateTime: tweetData.date_time,
    });
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticationToken,
  async (request, response) => {
    const { user_id } = request;
    const { tweetId } = request.params;
    const getFollowingQuery = `
    SELECT 
        following_user_id
    FROM 
        follower
    WHERE 
        follower_user_id LIKE ${user_id};`;
    const followingUsers = await db.all(getFollowingQuery);

    const followingUserList = followingUsers.map(
      (each) => each.following_user_id
    );

    const tweetUserQuery = `
    SELECT 
        tweet_id
    FROM 
        tweet
    WHERE 
        user_id IN (${followingUserList});`;
    const followingTweet = await db.all(tweetUserQuery);
    const followingTweetIdArray = followingTweet.map((each) => each.tweet_id);

    if (followingTweetIdArray.includes(parseInt(tweetId))) {
      const getLikeQuery = `
        SELECT
            user.username AS name
        FROM 
            like
        INNER JOIN user ON like.user_id = user.user_id
        WHERE
            like.tweet_id LIKE ${tweetId};`;
      const likedUserQuery = await db.all(getLikeQuery);
      response.send(likedUserArray(likedUserQuery));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticationToken,
  async (request, response) => {
    const { user_id } = request;
    const { tweetId } = request.params;

    const getFollowingQuery = `
    SELECT 
        following_user_id
    FROM 
        follower
    WHERE 
        follower_user_id LIKE ${user_id};`;

    const followingUsers = await db.all(getFollowingQuery);

    const followingUserList = followingUsers.map(
      (each) => each.following_user_id
    );

    const tweetUserQuery = `
    SELECT 
        tweet_id
    FROM 
        tweet
    WHERE 
        user_id IN (${followingUserList});`;

    const followingTweet = await db.all(tweetUserQuery);

    const followingTweetIdArray = followingTweet.map((each) => each.tweet_id);

    if (followingTweetIdArray.includes(parseInt(tweetId))) {
      const getReplyQuery = `
    SELECT 
        user.name,
        reply.reply
    FROM user
    INNER JOIN reply ON user.user_id = reply.user_id
    WHERE
        reply.tweet_id LIKE ${tweetId};`;
      const replyQuery = await db.all(getReplyQuery);
      response.send(replyConversion(replyQuery));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get("/user/tweets/", authenticationToken, async (request, response) => {
  const { user_id, username } = request;
  const getUserQuery = `
    SELECT 
        tweet_id
    FROM 
        tweet
    WHERE
        user_id LIKE ${user_id};`;
  const userTweetQuery = await db.all(getUserQuery);
  const userTweetId = userTweetQuery.map((each) => each.tweet_id);

  const getTweetDetailsQuery = `
    SELECT 
        tweet.tweet,
        count(like.user_id) as likes,
        count(reply.reply) as replies,
        tweet.date_time as dateTime
    FROM (tweet INNER JOIN like ON like.user_id = tweet.user_id) AS T
    INNER JOIN reply ON T.user_id = reply.user_id
    WHERE 
        tweet.tweet_id IN (${userTweetId});`;

  const userTweetDetails = await db.all(getTweetDetailsQuery);
  /* response.send(userTweetDetails);*/
  response.send(
    userTweetDetails.map((each) => {
      return {
        tweet: tweet.tweet,
        likes: tweet.likes,
        replies: tweet.replies,
        dateTime: tweet.dateTime,
      };
    })
  );
});

app.post("/user/tweets/", authenticationToken, async (request, response) => {
  const { tweet } = request.body;
  const { user_id } = request;
  const date = new Date();
  const dateTime = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
  const getAddTweetQuery = `
    INSERT INTO 
    tweet (tweet, user_id, date_time)
    VALUES (
        '${tweet}',
        ${user_id},
        '${dateTime}'
        );`;
  await db.run(getAddTweetQuery);
  response.send("Created a Tweet");
});

const sameUser = async (request, response, next) => {
  const { user_id } = request;
  const { tweetId } = request.params;
  const getUserQuery = `
    SELECT 
        DISTINCT(user_id)
    FROM 
        tweet
    WHERE 
        tweet_id LIKE ${tweetId};`;
  const userExist = await db.get(getUserQuery);
  if (userExist.user_id === user_id) {
    next();
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
};

app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  sameUser,
  async (request, response) => {
    const { tweetId } = request.params;
    const { user_id } = request;
    const getUserDeleteTweet = `
    DELETE FROM tweet
    WHERE 
        tweet_id LIKE ${tweetId};`;
    await db.run(getUserDeleteTweet);
    response.send("Tweet Removed");
  }
);
module.exports = app;
