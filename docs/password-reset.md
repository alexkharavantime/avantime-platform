# Password reset

Reset tokens are random, stored only as SHA-256 hashes, expire after 30 minutes and can be used once. In development the API returns a local reset URL. In production connect an email provider and never expose the token in the response.
