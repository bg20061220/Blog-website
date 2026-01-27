# Building ClipFlow: An AI-Powered Video Editor in 48 Hours

*How I built a smart video editor that automatically removes silence, repetitions, and false starts using keyword matching, LLMs, and FFmpeg.*

---

## The Problem

If you've ever created short-form video content, you know the pain:

- **30 minutes** scripting
- **30 minutes** recording (usually multiple takes)
- **4+ hours** editing

That last part is the killer. You sit there scrubbing through footage, cutting out every "um", every awkward pause, every false start where you said "I was gonna— I went to the...". 

For beginners, this editing bottleneck often stops them from posting altogether. The creative energy dies in the timeline.

I wanted to build something that removed the tedious parts. 
Not replace the creator's vision but eliminate the grunt work. Remove the silence. Detect the repeated takes. Cut the false starts. Give creators a clean first cut in seconds, not hours.

That's ClipFlow.

---

## The Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIPFLOW                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────┐    ┌──────────────┐    ┌───────────────────┐    │
│   │  Upload  │───▶│ Transcribe   │───▶│  Word Timestamps  │    │
│   │  (MP4)   │    │ (AssemblyAI) │    │  + Chapters       │    │
│   └──────────┘    └──────────────┘    └─────────┬─────────┘    │
│                                                  │               │
│                    ┌─────────────────────────────┼───────────┐  │
│                    │                             │           │  │
│                    ▼                             ▼           ▼  │
│            ┌──────────────┐            ┌─────────────┐ ┌──────┐│
│            │ AI Assembly  │            │Smart Stitch │ │Merge ││
│            │   (Groq)     │            │ (Algorithms)│ │      ││
│            └──────┬───────┘            └──────┬──────┘ └──┬───┘│
│                   │                           │           │    │
│                   └───────────────┬───────────┴───────────┘    │
│                                   ▼                             │
│                          ┌──────────────┐                       │
│                          │   Preview    │                       │
│                          │  + Effects   │                       │
│                          └──────┬───────┘                       │
│                                 │                               │
│                                 ▼                               │
│                          ┌──────────────┐                       │
│                          │   Export     │                       │
│                          │  (FFmpeg)    │                       │
│                          └──────────────┘                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Why |
|-------|------------|-----|
| Frontend | Next.js 14, React, TypeScript | Server components, API routes, type safety |
| Styling | Tailwind CSS | Rapid UI development |
| State | Zustand | Simple, performant state management |
| Database | Supabase + Prisma | Postgres with great DX |
| Storage | Supabase Storage | Video file hosting |
| Transcription | AssemblyAI | Word-level timestamps, high accuracy |
| LLM | Groq (llama-3.1-8b-instant) | Fast inference, free tier |
| Video Processing | FFmpeg | Industry standard |
| Client Conversion | FFmpeg.wasm | Browser-based format conversion |

---

## Deep Dive: The Three Editing Modes

### 1. AI Assembly — "The ultimate compilation tool for long form videos."

The user describes what they're looking for:

```
"Find all parts where I talk about revenue"
```

We send this to Groq along with the chapter summaries:

The LLM returns the relevant chapter IDs, and we assemble them into a preview.

**Cost:** ~$0.0002 per request on Groq's free tier.

---

### 2. Merge — "Manual merging of videos with clean transitions and no cuts and pauses."

The user manually selects and reorders clips, but we handle the cleanup:

- **Silence removal** — Find gaps > 0.7s between words
- **Repetition removal** — Detect duplicate sentences

This gives power users control while still saving them time.

---

### 3. Smart Stitch — "Do Everything For Me"

This is where it gets interesting. Fully automatic editing with multiple detection algorithms.

---

## Deep Dive: The Smart Algorithms

### Algorithm 1: Silence Detection

Simple but effective. I have word-level timestamps from AssemblyAI:

I iterate through words and find gaps:

```typescript
const SILENCE_THRESHOLD = 0.7; // seconds

for (let i = 0; i < words.length - 1; i++) {
  const gap = words[i + 1].start - words[i].end;
  
  if (gap > SILENCE_THRESHOLD) {
    // End current segment, start new one
    segments.push({ start: segmentStart, end: words[i].end });
    segmentStart = words[i + 1].start;
  }
}
```

**Result:** Long pauses are automatically cut out.

---

### Algorithm 2: Repetition Detection (The Hard Part)

This was my biggest challenge. Creators often record multiple takes:

```
Take 1: "I built a tool that helped creators..."
Take 2: "I built the tool that helped creators..."
Take 3: "I built a tool that helped creator..."
```

These are semantically identical but textually different:
- "a" vs "the"
- "creators" vs "creator"
- Different punctuation

#### Attempt 1: Exact Matching (Failed)

```typescript
if (phrase1 === phrase2) {
  // Mark as duplicate
}
```

**Problem:** Never matched because of small word differences.

#### Attempt 2: AI Detection (Unreliable)

We tried having Groq identify repetitions:

```typescript
const response = await groq.chat.completions.create({
  messages: [{
    role: "user",
    content: `Find repeated sentences in this transcript...`
  }]
});
```

**Problem:** The LLM was inconsistent — sometimes too aggressive (deleting everything), sometimes too passive (missing obvious duplicates).

#### Attempt 3: Keyword Extraction (Success!)

I settled on a keyword-based approach:

```typescript
const extractKeywords = (text: string): string[] => {
  const stopWords = new Set([
    'i', 'im', 'a', 'an', 'the', 'and', 'or', 'but', 'to', 'at', 
    'of', 'in', 'on', 'is', 'was', 'were', 'are', 'be', 'been',
    'that', 'this', 'which', 'who', 'where', 'when', 'how', 'what',
    'you', 'your', 'we', 'they', 'my', 'may', 'can', 'could', 'would'
  ]);
  
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')  // Remove punctuation
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
};
```

Now comparing keyword overlap:

```typescript
const keywordOverlap = (kw1: string[], kw2: string[]): number => {
  const set1 = new Set(kw1);
  const matches = kw2.filter(w => set1.has(w)).length;
  return matches / Math.min(kw1.length, kw2.length);
};

// 60%+ keyword overlap = likely duplicate
if (keywordOverlap(keywords1, keywords2) >= 0.6) {
  // Mark second occurrence for deletion
}
```

**Example:**

```
Sentence 1: "I built a tool that helped creators make 300 million"
Keywords 1: ["built", "tool", "helped", "creators", "make", "300", "million"]

Sentence 2: "I built the tool that helped creator make 300 million"  
Keywords 2: ["built", "tool", "helped", "creator", "make", "300", "million"]

Overlap: 6/7 = 85.7% → DUPLICATE
```

**Result:** Catches semantically identical sentences even with word variations.

---

### Algorithm 3: False Start Detection

Creators often start a sentence, stumble, and restart:

```
"I was gonna— I went to the store."
```

I detect short sentences followed by longer versions with the same beginning:

```typescript
function findFalseStarts(words: WordData[]): number[] {
  const deleted: number[] = [];
  
  // Find sentence boundaries
  for (let i = 0; i < words.length; i++) {
    if (!words[i].word.match(/[.?!]$/)) continue;
    
    const shortEnd = i + 1;
    let shortStart = i;
    
    // Find start of this sentence
    while (shortStart > 0 && !words[shortStart - 1].word.match(/[.?!]$/)) {
      shortStart--;
    }
    
    // Skip if too long (probably not a false start)
    if (shortEnd - shortStart > 6) continue;
    
    const shortPhrase = normalize(words.slice(shortStart, shortEnd));
    
    // Look for longer version starting the same way
    for (let j = shortEnd; j < words.length; j++) {
      const comparePhrase = normalize(words.slice(j, j + (shortEnd - shortStart)));
      
      if (shortPhrase === comparePhrase || 
          comparePhrase.startsWith(shortPhrase)) {
        // Check if longer version continues
        const longerPhrase = normalize(words.slice(j, j + (shortEnd - shortStart) + 3));
        
        if (longerPhrase.length > shortPhrase.length) {
          // Mark short phrase (false start) for deletion
          for (let k = shortStart; k < shortEnd; k++) {
            deleted.push(k);
          }
          break;
        }
      }
    }
  }
  
  return deleted;
}
```

---

### Algorithm 4: Cross-Clip Detection

The magic happens when we process multiple clips together:

```typescript
// Combine all words from all clips
const allWords: WordWithClip[] = [];

for (const clip of sortedClips) {
  const words = clip.words as WordTimestamp[];
  
  words.forEach((word) => {
    allWords.push({
      ...word,
      clipId: clip.id,
      clipUrl: clip.url,
    });
  });
}

// Now run detection on combined transcript
const repetitions = findRepetitions(allWords);
const falseStarts = findFalseStarts(allWords);
```

**Result:** If you say the same thing in Clip 1 and Clip 3, it catches it.

---

## Deep Dive: Real-Time Preview

I needed smooth playback across multiple segments from different videos. The challenge:

```
Segment 1: video1.mp4, 3.5s - 8.2s
Segment 2: video2.mp4, 12.1s - 18.6s
Segment 3: video1.mp4, 22.0s - 25.5s
```

### Attempt 1: Remotion Player (Too Laggy)

Remotion is great for rendering, but real-time preview with multiple segments was choppy.

### Solution: HTML5 Video with JavaScript Seeking

```typescript
const videoRef = useRef<HTMLVideoElement>(null);
const [currentChapterIndex, setCurrentChapterIndex] = useState(0);

useEffect(() => {
  const video = videoRef.current;
  if (!video) return;

  const onTimeUpdate = () => {
    const chapter = bufferedChapters[currentChapterIndex];
    
    // Check if we've reached the end of current chapter
    if (video.currentTime >= chapter.bufferedEnd - 0.05) {
      const nextIndex = currentChapterIndex + 1;
      
      if (nextIndex < bufferedChapters.length) {
        // Jump to next chapter
        setCurrentChapterIndex(nextIndex);
        video.currentTime = bufferedChapters[nextIndex].bufferedStart;
      } else {
        // End of all chapters
        video.pause();
      }
    }
  };

  video.addEventListener('timeupdate', onTimeUpdate);
  return () => video.removeEventListener('timeupdate', onTimeUpdate);
}, [currentChapterIndex, bufferedChapters]);
```

**Result:** Smooth playback by seeking the native video element.

---

## Deep Dive: Transitions & Effects

### Transitions

I supported three transition types between segments:

```typescript
type TransitionType = "cut" | "fade" | "flash";
```

Implementation using CSS and state:

```typescript
const [isTransitioning, setIsTransitioning] = useState(false);

// When chapter ends:
if (preset.transitionType === "cut") {
  // Instant jump
  video.currentTime = nextChapter.start;
} else {
  // Fade or flash
  setIsTransitioning(true);
  video.pause();
  
  setTimeout(() => {
    video.currentTime = nextChapter.start;
    
    setTimeout(() => {
      setIsTransitioning(false);
      video.play();
    }, preset.transitionDuration * 1000);
  }, preset.transitionDuration * 500);
}
```

The overlay:

```tsx
{isTransitioning && (
  <div
    style={{
      position: "absolute",
      inset: 0,
      backgroundColor: preset.transitionType === "flash" ? "#ffffff" : "#000000",
      zIndex: 20,
    }}
  />
)}
```

### Zoom Pulse Effect

Subtle zoom on chapter change:

```typescript
const [zoomScale, setZoomScale] = useState(1);

useEffect(() => {
  if (!preset.effects.zoomPulse) return;
  
  setZoomScale(1.1);
  
  const timer = setTimeout(() => setZoomScale(1), 300);
  return () => clearTimeout(timer);
}, [currentChapterIndex]);
```

Applied to video:

```tsx
<video
  style={{
    transform: `scale(${zoomScale})`,
    transition: "transform 0.3s ease-out",
  }}
/>
```

---

## Deep Dive: Export with Burned-In Captions

### Step 1: Generate SRT Subtitles

```typescript
function generateSRT(segments: Segment[]): string {
  let srt = "";
  let cumulativeTime = 0;
  
  segments.forEach((seg, index) => {
    const duration = seg.end - seg.start;
    const startTime = cumulativeTime;
    const endTime = cumulativeTime + duration;
    
    const formatTime = (seconds: number) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 1000);
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
    };
    
    if (seg.headline) {
      srt += `${index + 1}\n`;
      srt += `${formatTime(startTime)} --> ${formatTime(endTime)}\n`;
      srt += `${seg.headline}\n\n`;
    }
    
    cumulativeTime = endTime;
  });
  
  return srt;
}
```

### Step 2: FFmpeg Pipeline

```typescript
// Step 1: Trim each segment
for (const segment of segments) {
  await spawn(FFMPEG_PATH, [
    "-y",
    "-ss", segment.start.toString(),
    "-i", segment.clipUrl,
    "-t", duration.toString(),
    "-c:v", "libx264",
    "-c:a", "aac",
    trimmedFile,
  ]);
}

// Step 2: Concatenate
await spawn(FFMPEG_PATH, [
  "-y",
  "-f", "concat",
  "-safe", "0",
  "-i", concatFile,
  "-c", "copy",
  outputFile,
]);

// Step 3: Burn in captions
await spawn(FFMPEG_PATH, [
  "-y",
  "-i", outputFile,
  "-vf", `subtitles=${srtFile}:force_style='FontSize=20,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2'`,
  "-c:a", "copy",
  finalOutput,
]);
```

---

## Performance Optimizations

### 1. Client-Side Video Conversion

iPhone videos are often HEVC (H.265), which browsers don't play. I use FFmpeg.wasm for client-side conversion:

```typescript
import { FFmpeg } from '@ffmpeg/ffmpeg';

const ffmpeg = new FFmpeg();
await ffmpeg.load();

await ffmpeg.writeFile('input.mov', await fetchFile(file));
await ffmpeg.exec(['-i', 'input.mov', '-c:v', 'libx264', 'output.mp4']);

const data = await ffmpeg.readFile('output.mp4');
```

**Result:** No server round-trip for format conversion.

### 2. Buffered Chapters

I pre-compute buffered timestamps to avoid recalculation during playback:

```typescript
const bufferedChapters = useMemo(() => {
  return activeChapters.map((ch) => {
    const buffer = useBuffer ? bufferAmount : preset.buffer;
    return {
      ...ch,
      bufferedStart: Math.max(0, ch.start - buffer),
      bufferedEnd: ch.end + buffer,
      bufferedDuration: (ch.end + buffer) - Math.max(0, ch.start - buffer),
    };
  });
}, [activeChapters, useBuffer, bufferAmount, preset.buffer]);
```

### 3. Lazy Loading

Clips are only loaded when needed:

```typescript
// Video src changes based on current chapter
<video src={currentChapter?.clipUrl} />
```

---

## Lessons Learned

### 1. LLMs Are Inconsistent for Structured Tasks

Our AI repetition detection was unreliable. Sometimes it deleted everything, sometimes nothing. **Deterministic algorithms won** for this use case.

### 2. Word-Level Timestamps Are Gold

AssemblyAI's word timestamps enabled everything — silence detection, repetition matching, caption sync. Without them, we'd be guessing.

### 3. Keyword Matching > Fuzzy String Matching

We tried Levenshtein distance and fuzzy matching. They were either too strict or too loose. **Keyword extraction with stop word removal** gave us the semantic similarity we needed.

### 4. Preview ≠ Export

Preview is approximate — JavaScript seeking, CSS effects. Export is precise — FFmpeg rendering. Accept this and optimize each separately.

### 5. Free Tiers Are Enough

- Groq: Free tier for LLM
- AssemblyAI: ~$0.37/hour (cheap)
- Supabase: Free tier for database + storage

Total cost for hackathon: **< $5**

---

## What's Next

- **Timeline Editor** — Visual cuts on a timeline
- **Voice Cleanup** — Noise reduction, loudness leveling
- **Jump Cut Smoothing** — AI-powered reframing
- **Template System** — Save and reuse edit styles

---

## Conclusion

ClipFlow started as a hackathon project with a simple question: *Can we automate the tedious parts of video editing?*

The answer is yes — with the right combination of:
- Speech-to-text for understanding content
- Keyword matching for semantic similarity  
- LLMs for intent-based selection
- FFmpeg for reliable video processing

**The code is open source.** We'd love to see what you build with it.

---

*Built in 48 hours. Powered by caffeine and curiosity.*

---

**Links:**
- [GitHub Repository](https://github.com/yourusername/clipflow)