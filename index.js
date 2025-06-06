const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const port = process.env.PORT || 5000;
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const formData = require('form-data');
const Mailgun = require('mailgun.js');
const mailgun = new Mailgun(formData);
const mg = mailgun.client({
  username: 'api',
  key: process.env.MAIL_GUN_API_KEY
});

// middleware
app.use(cors());
app.use(express.json());


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mcynqnr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const usersCollection = client.db("foodHeavenDB").collection("users");
    const menuCollection = client.db("foodHeavenDB").collection("menu");
    const reviewsCollection = client.db("foodHeavenDB").collection("reviews");
    const cartsCollection = client.db("foodHeavenDB").collection("carts");
    const paymentsCollection = client.db("foodHeavenDB").collection("payments");

    // :::: jwt related endpoints or api :::::
    app.post('/jwt', async(req, res)=>{
      const userEmail = req.body;
      const token = jwt.sign(userEmail, process.env.ACCESS_TOKEN_SECRET, {expiresIn: '1h'});
      res.send({token});
    })

    // ::::middleware ::::
    const verifyToken = (req, res, next) =>{
      // console.log('inside varifyToken', req.headers.authorization);
      if(!req.headers.authorization){
        return res.status(401).send({message: 'unauthorized access'})
      }
      const token = req.headers.authorization.split(' ')[1];

      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded)=>{
        if(err){
          return res.status(401).send({message: 'unauthorized access'});
        }
        req.decoded = decoded;
        next();
      });
    }

    // we have to use verifyAdmin middleware after verifyToken middleware
    const verifyAdmin = async(req, res, next) =>{
      const email = req.decoded.email;
      const query = {email: email};
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if(!isAdmin){
        return res.status(403).send({message: 'access is forbidden'});
      }
      next();
    }
    
    // :::: users related endpoints :::::
    app.get('/users', verifyToken, verifyAdmin, async(req, res)=>{
      const result = await usersCollection.find().toArray();
      res.send(result);
    })

    // created endpoint or api to check whether user is admin or not
    app.get('/users/admin/:email', verifyToken, async(req, res)=>{
      const email = req.params.email;
      if(email !== req.decoded.email){
          res.status(403).send({message: 'access is forbidden'});
      }

      const query = {email: email};
      const user = await usersCollection.findOne(query);
      let admin = false;
      if(user){
        admin = user?.role === 'admin';
      }
      res.send({admin});
    })

    app.post('/users', async(req, res)=>{
      const user = req.body;

      // insert user if email does not exist in database
      const query = {email: user.email}
      const existingUser = await usersCollection.findOne(query);
      // console.log(existingUser)
      if(existingUser){
        res.send({message: "user already existed", insertedId: null});
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    })

    app.delete('/users/:id', verifyToken, verifyAdmin, async(req, res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    })

    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async(req, res)=>{
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      };
      const result = await usersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    // :::: menu related endpoint :::::
    app.get('/menu', async(req, res)=>{
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

    app.get('/menu/:id', async(req, res) =>{
      const id = req.params.id;
      const query = { _id: new ObjectId(id)};
      const result = await menuCollection.findOne(query);
      res.send(result);
    })

    app.post('/menu', async(req, res) =>{
      const item = req.body;
      const result = await menuCollection.insertOne(item);
      res.send(result);
    })

    app.patch('/menu/:id', async(req, res) =>{
      const item = req.body;
      const id = req.params.id;
      const filter = {_id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          name: item.name,
          category: item.category,
          price: item.price,
          recipe: item.recipe,
          image: item.image
        }
      };
      const result = await menuCollection.updateOne(filter, updatedDoc);
      res.send(result);


    })

    app.delete('/menu/:id', verifyToken, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      console.log(id)
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    })

    // :::: reviews related endpoint :::::
    app.get('/reviews', async(req, res)=>{
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    })

    // ::::: carts related endpoints ::::
    app.get('/carts', async(req, res)=>{
      const email = req.query.email;
      const query = {email: email}
      const result = await cartsCollection.find(query).toArray();
      res.send(result);
    })

    app.post('/carts', async(req, res)=>{
      const cartItem = req.body;
      const result = await cartsCollection.insertOne(cartItem);
      res.send(result);

    })

    app.delete('/carts/:id', async(req, res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await cartsCollection.deleteOne(query);
      res.send(result);
    })

    // ::::::: payment intent ::::::::
    app.post('/create-payment-intent', async(req, res) =>{
      const {price} = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      })

      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    // ::::::: payment related api ::::::::
    app.post('/payments', async(req, res) =>{
      const payment = req.body;
      console.log('payment info', payment)
      const paymentResult = await paymentsCollection.insertOne(payment);
      
      const query = {_id: {
        // 'ObjectId' of 'ObjectId' is deprecated but it is working
        $in: payment.cartIds.map(cartId => new ObjectId(cartId))
      }}
      // console.log(query)
      const deleteResult = await cartsCollection.deleteMany(query);

      // send email for payment confirmation
      mg.messages.create(process.env.MAIL_GUN_SENDING_DOMAIN, {
        from: "Mailgun Sandbox<postmaster@sandbox320f002322c341aeba58e89d84b562d7.mailgun.org>",
        to: ['mithunmodakdu@gmail.com'],
        subject: 'payment confirmation',
        text: 'Your order has been confirmed',
        html: `
        <div>
          <h2>Thank you for your payment.</h2>
          <h4>Your transaction id: <strong>${payment.transactionId}</strong></h4>
          <p>we would like to  get your feedback about the food.</p>
        </div>
        `
      })
      .then(msg => console.log(msg))
      .catch(error => console.log(error))

      res.send({paymentResult, deleteResult});
    })

    app.get('/payments/:email', verifyToken, async(req, res) =>{
      const query = {email: req.params.email};
      // console.log(query)

      if(req.params.email !== req.decoded.email){
        res.status(403).send({message: 'Access is forbidden'});
      }
      const result = await paymentsCollection.find(query).toArray();
      res.send(result);
    })

    // ::::::: stats api ::::::::
    app.get('/admin-stats', verifyToken, verifyAdmin, async(req, res) =>{
      const users = await usersCollection.estimatedDocumentCount();
      const menuItems = await menuCollection.estimatedDocumentCount();
      const orders = await paymentsCollection.estimatedDocumentCount();

      // not best way
      // const payments = await paymentsCollection.find().toArray();
      // const revenue = payments.reduce((total, item) => total + item.price, 0);
      const result = await paymentsCollection.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$price'}
          }
        }
      ]).toArray();
      
      const revenue = result.length > 0 ? result[0].totalRevenue : 0;

      res.send({users, menuItems, orders, revenue});
    })

    app.get('/order-stats', async(req, res) =>{
      const result = await paymentsCollection.aggregate([
        // for converting menuItemIds string into ObjectId
        {
          $addFields: {
            menuItemIds: {
              $map: {
                input: '$menuItemIds',
                as: 'id',
                in: {$toObjectId: '$$id'}
              }
            }
          }
        },

        // unwind menuItemIds
        {
          $unwind: '$menuItemIds'
        },
        
        // lookup menuItemIds field of payments with _id field of menu
        {
          $lookup: {
            from: 'menu',
            localField: 'menuItemIds',
            foreignField: '_id',
            as: 'menuItems'
          }
        },

        // unwind menuItems
        {
          $unwind: '$menuItems'
        },

        //use group to get _id: categoryName , quantity: documents number, revenue: totalPrice
        {
          $group: {
            _id: '$menuItems.category',
            quantity: { $sum: 1 },
            revenue: { $sum: '$menuItems.price'}
          }
        },

        //use project to replace _id fieldName with category fieldName
        {
          $project: {
            _id: 0,
            category: '$_id',
            quantity: '$quantity',
            revenue: '$revenue'
          }
        }
        
      ]).toArray();
      res.send(result);
    })

  

    




    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res)=>{
  res.send('Food Heaven Server in running')
})

app.listen(port, ()=>{
  console.log(`Food Heaven server in running on port ${port}`)
})