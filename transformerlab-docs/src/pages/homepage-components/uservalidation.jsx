import React from 'react';

import Ram from './img/ram.png';
import Elena from './img/elena.jpg';
import Jash from './img/jash.jpg';

const userValidations = [
  {
    quote:
      'Transformer Lab has made it easy for me to experiment and use LLMs in a completely private fashion.',
    author: 'Ramanan Sivaranjan, Head of the Engineering at Quantum Bridge ',
    avatar: Ram,
  },
  {
    quote: 'The essential open-source stack for serious ML teams',
    author: 'Elena Yunusov, Executive Director at Human Feedback Foundation',
    avatar: Elena,
  },
  {
    quote:
      'For too long, researchers have been stuck using outdated tools. Transformer Lab is the future.',
    author: 'Jash Mehta, Applied Research Scientist at ServiceNow Research',
    avatar: Jash,
  },
];

const UserValidation = () => (
  <section
    style={{
      padding: '4rem 0',
      textAlign: 'center',
    }}
  >
    <h2 style={{ fontSize: '2rem', marginBottom: '2rem', fontWeight: 600 }}>
      Trusted by Innovative Teams
    </h2>
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '2rem',
        flexWrap: 'wrap',
        maxWidth: '900px',
        margin: '0 auto',
      }}
    >
      {userValidations.map((uv) => (
        <div
          key={uv.author}
          style={{
            background: '#fff',
            borderRadius: '1rem',
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            padding: '2rem',
            maxWidth: '320px',
            flex: '1 1 260px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <img
            src={uv.avatar}
            alt={uv.author}
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              marginBottom: '1rem',
              objectFit: 'cover',
              border: '2px solid #e5e7eb',
            }}
          />
          <blockquote
            style={{
              fontStyle: 'italic',
              color: '#374151',
              marginBottom: '1.5rem',
            }}
          >
            “{uv.quote}”
          </blockquote>
          <div
            style={{
              fontWeight: 600,
              color: '#2563eb',
            }}
          >
            {uv.author}
          </div>
        </div>
      ))}
    </div>
  </section>
);

export default UserValidation;
