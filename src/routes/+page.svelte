<script lang="ts">
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let copied = $state(false);

	async function copyWebhookUrl() {
		if (!data.webhookUrl) return;
		await navigator.clipboard.writeText(data.webhookUrl);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	function formatDate(iso: string | null | undefined): string {
		if (!iso) return 'unknown time';
		return new Date(iso).toLocaleString();
	}
</script>

<svelte:head>
	<title>Asteroid</title>
</svelte:head>

<main>
	<h1>☄️ Asteroid</h1>
	<p class="tagline">
		Catch your <a href="https://repebble.com/index">Pebble Index</a> voice notes in your own private
		<a href="https://atproto.com/blog/atproto-spaces-alpha">atproto space</a>.
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
			<p class="hint">You need an account on an atproto-spaces enabled PDS.</p>
		</form>
	{:else}
		<section class="webhook">
			<h2>Your webhook URL</h2>
			<p class="hint">
				Paste this into the Pebble app under <em>Index 01 Settings → Webhook</em> and choose
				“Both” as the payload. Keep it secret — anyone with the URL can add recordings.
			</p>
			<div class="row">
				<input type="text" readonly value={data.webhookUrl} onfocus={(e) => e.currentTarget.select()} />
				<button type="button" onclick={copyWebhookUrl}>{copied ? 'Copied!' : 'Copy'}</button>
			</div>
			<p class="hint">
				{#if data.lastWebhookAt}
					Last webhook: {formatDate(data.lastWebhookAt)}
					{#if data.lastWebhookStatus}({data.lastWebhookStatus}){/if}
				{:else}
					No webhooks received yet — try “Send test event” in the Pebble app.
				{/if}
			</p>
			<div class="row">
				<form method="POST" action="?/rotateToken">
					<button type="submit" class="subtle">Regenerate URL</button>
				</form>
				<form method="POST" action="?/logout">
					<button type="submit" class="subtle">Sign out</button>
				</form>
			</div>
		</section>

		<section class="recordings">
			<h2>Captures</h2>
			{#if !data.entries?.length}
				<p class="hint">Nothing here yet. Recordings and notes appear as your ring delivers them.</p>
			{:else}
				<ul>
					{#each data.entries as entry (`${entry.kind}/${entry.rkey}`)}
						<li>
							<div class="meta">
								<time datetime={entry.capturedAt ?? undefined}>
									{formatDate(entry.capturedAt)}
								</time>
								<span class="badge kind">{entry.kind}</span>
								{#if entry.trigger}
									<span class="badge">{entry.trigger}</span>
								{/if}
								{#if entry.dueAt}
									<span class="badge">due {formatDate(entry.dueAt)}</span>
								{/if}
							</div>
							{#if entry.text}
								<p class="transcription">{entry.text}</p>
							{:else}
								<p class="transcription empty">No transcript</p>
							{/if}
							{#if entry.audioCid}
								<audio
									controls
									preload="none"
									src={`/api/audio/${entry.audioCid}${entry.audioMimeType ? `?type=${encodeURIComponent(entry.audioMimeType)}` : ''}`}
								></audio>
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
		margin-top: 2.5rem;
	}
	.row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
	}
	input[type='text'] {
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
	.hint {
		color: #666;
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
