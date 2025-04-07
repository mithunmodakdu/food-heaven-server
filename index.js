const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config()
const port = process.env.PORT || 5000;

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
    
    // :::: users related endpoints :::::
    app.post('/users', async(req, res)=>{
      const user = req.body;

      // insert user if email does not exist in database
      const query = {email: user.email}
      const existingUser = await usersCollection.findOne(query);
      if(existingUser){
        res.send({message: "user already existed", insertedId: null});
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    })

    // :::: menu related endpoint :::::
    app.get('/menu', async(req, res)=>{
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

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