<script lang="ts">
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  let copied = $state<string | null>(null);

  async function copyUrl(url: string | undefined, which: string) {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    copied = which;
    setTimeout(() => (copied = null), 2000);
  }

  function formatDate(iso: string | null | undefined): string {
    if (!iso) return "unknown time";
    return new Date(iso).toLocaleString();
  }

  function audioSrc(entry: { audioCid: string | null; audioMimeType: string | null; visibility: string }): string {
    const params = new URLSearchParams();
    if (entry.audioMimeType) params.set("type", entry.audioMimeType);
    params.set("visibility", entry.visibility);
    return `/api/audio/${entry.audioCid}?${params}`;
  }
</script>

<svelte:head>
  <title>Asteroid</title>
</svelte:head>

<main>
  <h1>☄️ Asteroid</h1>
  <p class="tagline">
    Catch your <a href="https://repebble.com/index">Pebble Index</a> voice notes in your own
    <a href="https://atproto.com/blog/atproto-spaces-alpha">atproto</a> repo.
  </p>

  {#if !data.loggedIn}
    {#if data.sessionError}
      <p class="error">{data.sessionError}</p>
    {/if}
    <form method="POST" action="?/login" class="login">
      <label for="handle">Your Atmosphere handle</label>
      <div class="row">
        <input
          id="handle"
          name="handle"
          type="text"
          placeholder="you.example.com"
          autocomplete="username"
          required
        />
        <button type="submit">Sign in</button>
      </div>
      {#if form?.handleError}
        <p class="error">{form.handleError}</p>
      {/if}
    </form>
  {:else}
    <section class="webhook">
      <h2>Private webhook</h2>
      {#if data.spacesSupported && data.privateWebhookUrl}
        <p class="hint">
          Recordings delivered here are stored in your <strong>private space</strong> — only you
          can read them.
        </p>
        <div class="row">
          <input
            type="text"
            readonly
            value={data.privateWebhookUrl}
            onfocus={(e) => e.currentTarget.select()}
          />
          <button type="button" onclick={() => copyUrl(data.privateWebhookUrl, "private")}>
            {copied === "private" ? "Copied!" : "Copy"}
          </button>
        </div>
        <form method="POST" action="?/rotateToken">
          <input type="hidden" name="hook" value="private" />
          <button type="submit" class="subtle">Regenerate URL</button>
        </form>
      {:else}
        <p class="hint">Your account doesn’t support spaces yet.</p>
      {/if}
    </section>

    <section class="webhook">
      <h2>Public webhook</h2>
      <p class="warning">⚠️ Recordings published with this webhook are public.</p>
      <p class="hint">
        Deliveries here are written to your <strong>public atproto repo</strong>: anyone can read,
        list and download them.
      </p>
      <div class="row">
        <input
          type="text"
          readonly
          value={data.publicWebhookUrl}
          onfocus={(e) => e.currentTarget.select()}
        />
        <button type="button" onclick={() => copyUrl(data.publicWebhookUrl, "public")}>
          {copied === "public" ? "Copied!" : "Copy"}
        </button>
      </div>
      <form method="POST" action="?/rotateToken">
        <input type="hidden" name="hook" value="public" />
        <button type="submit" class="subtle">Regenerate URL</button>
      </form>
    </section>

    <p class="hint">
      Paste a webhook URL into the Pebble app under <em>Index 01 Settings → Webhook</em> and pick
      “Both” as the payload. Keep them secret — anyone with a URL can add recordings.
      {#if data.lastWebhookAt}
        Last webhook: {formatDate(data.lastWebhookAt)}
        {#if data.lastWebhookStatus}({data.lastWebhookStatus}){/if}
      {:else}
        No webhooks received yet — try “Send test event” in the Pebble app.
      {/if}
    </p>
    <form method="POST" action="?/logout">
      <button type="submit" class="subtle">Sign out</button>
    </form>

    <section class="recordings">
      <h2>Captures</h2>
      {#if form?.deleteError}
        <p class="error">{form.deleteError}</p>
      {/if}
      {#if !data.entries?.length}
        <p class="hint">Nothing here yet. Recordings and notes appear as your ring delivers them.</p>
      {:else}
        <ul>
          {#each data.entries as entry (`${entry.visibility}/${entry.kind}/${entry.rkey}`)}
            <li>
              <div class="meta">
                <time datetime={entry.capturedAt ?? undefined}>
                  {formatDate(entry.capturedAt)}
                </time>
                <span class="badge kind">{entry.kind}</span>
                <span class="badge visibility {entry.visibility}">
                  {entry.visibility === "public" ? "🌍 public" : "🔒 private"}
                </span>
                {#if entry.trigger}
                  <span class="badge">{entry.trigger}</span>
                {/if}
                {#if entry.dueAt}
                  <span class="badge">due {formatDate(entry.dueAt)}</span>
                {/if}
                <form method="POST" action="?/deleteEntry" class="delete">
                  <input type="hidden" name="visibility" value={entry.visibility} />
                  <input type="hidden" name="collection" value={entry.collection} />
                  <input type="hidden" name="rkey" value={entry.rkey} />
                  <button type="submit" class="subtle danger" aria-label="Delete this capture">
                    Delete
                  </button>
                </form>
              </div>
              {#if entry.text}
                <p class="transcription">{entry.text}</p>
              {:else}
                <p class="transcription empty">No transcript</p>
              {/if}
              {#if entry.audioCid}
                <audio controls preload="none" src={audioSrc(entry)}></audio>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</main>

<style>
  main {
    max-width: 42rem;
    margin: 0 auto;
    padding: 2rem 1rem 4rem;
    font-family: system-ui, sans-serif;
    line-height: 1.5;
  }
  h1 {
    margin-bottom: 0.25rem;
  }
  .tagline {
    margin-top: 0;
    color: #555;
  }
  section {
    margin-top: 2rem;
  }
  .row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
  }
  input[type="text"] {
    flex: 1;
    min-width: 12rem;
    padding: 0.5rem 0.75rem;
    font: inherit;
    border: 1px solid #ccc;
    border-radius: 0.375rem;
  }
  button {
    padding: 0.5rem 1rem;
    font: inherit;
    border: 1px solid #333;
    border-radius: 0.375rem;
    background: #333;
    color: #fff;
    cursor: pointer;
  }
  button.subtle {
    background: transparent;
    color: #333;
    border-color: #ccc;
  }
  button.danger {
    color: #b00020;
    border-color: #e0b4bc;
    padding: 0.125rem 0.625rem;
    font-size: 0.8125rem;
  }
  .hint {
    color: #666;
    font-size: 0.875rem;
  }
  .warning {
    background: #fff4e5;
    border: 1px solid #f0c36d;
    border-radius: 0.375rem;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
  }
  .error {
    color: #b00020;
  }
  .recordings ul {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  .recordings li {
    border: 1px solid #e0e0e0;
    border-radius: 0.5rem;
    padding: 1rem;
  }
  .meta {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    color: #666;
    font-size: 0.8125rem;
    flex-wrap: wrap;
  }
  .meta .delete {
    margin-left: auto;
  }
  .badge {
    border: 1px solid #ccc;
    border-radius: 999px;
    padding: 0 0.5rem;
    font-size: 0.75rem;
  }
  .badge.kind {
    text-transform: capitalize;
    border-color: #999;
  }
  .badge.visibility.public {
    border-color: #f0c36d;
    background: #fff4e5;
  }
  .badge.visibility.private {
    border-color: #b3cde0;
    background: #eef5fb;
  }
  .transcription {
    white-space: pre-wrap;
    margin: 0.5rem 0;
  }
  .transcription.empty {
    color: #999;
    font-style: italic;
  }
  audio {
    width: 100%;
  }
</style>
