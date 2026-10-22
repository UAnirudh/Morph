// Unit tests must never make a real model call.
delete process.env.OPENAI_API_KEY;
process.env.MORPH_ALLOW_SIGNUP = "true";
