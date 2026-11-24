# Note World (MERN, MVC)

Notes can be put in categories (pick an existing one or type a new one), and the list can be filtered by category.

- React -> frontend
- Node -> server
- Express -> API
- MongoDB -> DB

## API routes

| Route | Method | Description |
|---|---|---|
| /user/register | POST | Create account |
| /user/login | POST | Login |
| /user/logout | POST | Logout |
| /note/create | POST | Create note |
| /note/read | GET | Get all my notes (optional `?category=Work` filter) |
| /note/read/:id | GET | Get one note |
| /note/update/:id | PUT | Update note |
| /note/delete/:id | DELETE | Delete note |

## Run it

1. Make sure MongoDB is running (`mongod`) or put an Atlas URL in `backend/.env` as `MONGO_URI`.
2. Backend:
   ```
   cd backend
   npm install
   npm run dev
   ```
3. Frontend (new terminal):
   ```
   cd frontend
   npm install
   npm run dev
   ```
4. Open http://localhost:5173
