// Unit tests must never make a real model call.
delete process.env.OPENAI_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.MORPH_AI_PROVIDER;
process.env.MORPH_ALLOW_SIGNUP = "true";
