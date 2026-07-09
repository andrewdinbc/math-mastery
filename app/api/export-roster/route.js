// This route printed plaintext names onto a PDF server-side - now that
// names are end-to-end encrypted, the server can never see the real name,
// so this would only ever produce garbled ciphertext. Superseded by
// Roster Manager (/dashboard/roster), which decrypts locally in the
// browser and offers a real "Download Unencrypted Copy" export.
export async function GET() {
  return Response.json(
    { error: 'Moved: use Roster Manager (/dashboard/roster) to download your unencrypted roster - names are encrypted and this server route can no longer read them.' },
    { status: 410 }
  );
}
