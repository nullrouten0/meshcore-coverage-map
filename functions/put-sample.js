export async function onRequest(context) {
  // Read JSON body (will throw if invalid JSON)
  const data = await request.json();

  // Do something with `data` here...
  console.log("Received:", data);

  return new Response(
    JSON.stringify({
      ok: true, received: data
    }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}