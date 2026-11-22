import { describe, expect, it } from 'bun:test';
import { findDeezerMatch, type DeezerTrack } from './musicquizCatalog';

function deezer(title: string, artist: string, preview = 'https://cdns-preview.example/clip.mp3'): DeezerTrack {
  return { id: 1, title, artist: { name: artist }, preview };
}

describe('findDeezerMatch', () => {
  it('prefers the exact title match over an alternate version', () => {
    const match = findDeezerMatch('Blinding Lights', ['The Weeknd'], [
      deezer('Blinding Lights (Remix)', 'The Weeknd'),
      deezer('Blinding Lights', 'The Weeknd'),
    ]);
    expect(match?.title).toBe('Blinding Lights');
  });

  it('ignores parenthetical suffixes when comparing titles', () => {
    const match = findDeezerMatch('Sunflower (Spider-Man: Into the Spider-Verse)', ['Post Malone', 'Swae Lee'], [
      deezer('Sunflower', 'Post Malone'),
    ]);
    expect(match?.title).toBe('Sunflower');
  });

  it('rejects alternate versions and tribute acts', () => {
    expect(
      findDeezerMatch('Believer', ['Imagine Dragons'], [
        deezer('Believer (Acoustic)', 'Imagine Dragons'),
        deezer('Believer - Tribute Version', 'Imagine Dragons Tribute Band'),
      ])
    ).toBeNull();
  });

  it('requires a matching artist', () => {
    expect(findDeezerMatch('Stay', ['The Kid LAROI', 'Justin Bieber'], [deezer('Stay', 'Rihanna')])).toBeNull();
    expect(
      findDeezerMatch('Stay', ['The Kid LAROI', 'Justin Bieber'], [
        deezer('Stay', 'The Kid LAROI'),
      ])?.artist.name
    ).toBe('The Kid LAROI');
  });

  it('ignores results without a preview clip', () => {
    expect(
      findDeezerMatch('Wonderwall', ['Oasis'], [{ id: 1, title: 'Wonderwall', artist: { name: 'Oasis' }, preview: '' }])
    ).toBeNull();
  });

  it('accepts remastered titles and matches on title prefixes', () => {
    expect(
      findDeezerMatch('Bohemian Rhapsody', ['Queen'], [
        deezer('Bohemian Rhapsody - Remastered 2011', 'Queen'),
      ])?.title
    ).toBe('Bohemian Rhapsody - Remastered 2011');
  });
});
