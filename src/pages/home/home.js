const POPULAR_QUESTIONS = [
  'What documents are required for enrollment?',
  'How do I request a Transcript of Records?',
  'What are the requirements for shifting programs?',
  'Where is the Registrar\'s Office?',
  'What scholarships are available?',
];

const CATEGORIES = [
  { title: 'Academic Assistance', text: 'Programs, prerequisites, grading, shifting and graduation.', href: '#/guide' },
  { title: 'Admission & Enrollment', text: 'CAT, requirements, schedules and enrollment steps.', href: '#/guide' },
  { title: 'Campus Directory', text: 'Offices, departments, buildings and services.', href: '#/directory' },
  { title: 'Campus Map', text: 'Find facilities around the campus.', href: '#/map' },
  { title: 'Scholarships', text: 'Financial assistance and application requirements.', href: '#/guide' },
  { title: 'Announcements', text: 'Dated and verified campus updates.', href: '#/announcements' },
];

export default {
  title: 'Home',
  render() {
    const chips = POPULAR_QUESTIONS.map(
      (q) => `<a class="chip" href="#/assistant?q=${encodeURIComponent(q)}">${q.replace(/&/g, '&amp;')}</a>`
    ).join('');
    const cards = CATEGORIES.map(
      (c) => `<a class="card" href="${c.href}"><h3>${c.title}</h3><p>${c.text}</p></a>`
    ).join('');

    return `
      <div class="container">
        <section class="hero">
          <h1>Your Campus. Your AI. Always Available.</h1>
          <p>Discover university information, get academic guidance, locate campus facilities, and find answers to your campus-related questions with CampusAI.</p>
          <div class="hero-actions">
            <a class="btn btn-primary" href="#/assistant">Start Chatting</a>
            <a class="btn" href="#/map">Explore Campus</a>
          </div>
        </section>

        <section class="section">
          <h2>Popular campus questions</h2>
          <div class="chip-list">${chips}</div>
        </section>

        <section class="section">
          <h2>Campus information</h2>
          <div class="card-grid">${cards}</div>
        </section>

        <section class="section">
          <h2>Offline and private by design</h2>
          <div class="card-grid">
            <div class="card"><h3>Runs on your device</h3><p>The AI model runs in your browser. After setup, the core assistant works without internet.</p></div>
            <div class="card"><h3>Your questions stay with you</h3><p>Your questions are answered inside your browser. Nothing is sent to a server. Saved conversation history is coming in a later version.</p></div>
            <div class="card"><h3>Source-supported answers</h3><p>University-specific answers are meant to cite verified documents, and say so when they can't.</p></div>
          </div>
        </section>
      </div>`;
  },
};
