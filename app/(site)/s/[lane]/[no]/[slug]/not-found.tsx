/** A lasting link to a story that isn't shown any more (taken down, or never paid for). */
export default function StoryNotFound() {
  return (
    <div className="disc">
      <header className="disc-top">
        <a className="brand" href="/">
          Fivehundrd<span className="bdot">.</span>
        </a>
      </header>
      <main className="disc-main disc-gone">
        <h1>This story isn&apos;t on Fivehundrd.</h1>
        <p>It may have been taken down. There are 500 others on the wall right now.</p>
        <a className="pay disc-cta" href="/">
          See who&apos;s on the wall
        </a>
      </main>
    </div>
  );
}
