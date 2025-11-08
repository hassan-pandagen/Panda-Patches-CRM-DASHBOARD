import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || ''
);

app.post('/create-user', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Depending on Supabase version, user info may be in `data.user` or `data`
    const userData = (data as any).user || data;

    return res.status(200).json({ user: userData });

  } catch (err) {
    return res.status(500).json({ error: 'Server error', details: err });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`User creation API running on port ${PORT}`));
