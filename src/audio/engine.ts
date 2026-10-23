import { songById, type Song, type Note, type Channel } from "./songs";
import { effectById } from "./sfx";
export interface Volumes {
  master?: number;
  music?: number;
  sfx?: number;
  ambience?: number;
}
const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);
const aliases: Record<string, string> = {
  farm: "spring",
  square: "village",
  market: "village",
  store: "shop",
  forest: "spring",
  mountain: "mine",
  beach: "summer",
  farmhouse: "inn",
  lantern: "bloom",
  evaluation: "ending",
  tool_upgrade: "upgrade",
  friendship: "heart_up",
};
/** Five-voice, look-ahead Web Audio sequencer. Audio starts only after user input. */
export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private effect: GainNode | null = null;
  private ambience: GainNode | null = null;
  private trackBus: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private song: Song | null = null;
  private desired = "title";
  private nextBar = 0;
  private orderIndex = 0;
  private stopped = false;
  private volumes = { master: 0.55, music: 0.55, sfx: 0.7, ambience: 0.4 };
  private noise: AudioBuffer | null = null;
  private waves = new Map<string, PeriodicWave>();
  private sources = new Set<AudioScheduledSourceNode>();
  async unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      const c = this.context;
      this.master = c.createGain();
      this.music = c.createGain();
      this.effect = c.createGain();
      this.ambience = c.createGain();
      this.master.connect(c.destination);
      this.music.connect(this.master);
      this.effect.connect(this.master);
      this.ambience.connect(this.master);
      this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const data = this.noise.getChannelData(0);
      let seed = 0x51a7e;
      for (let i = 0; i < data.length; i++) {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        data[i] = ((seed >>> 0) / 4294967296) * 2 - 1;
      }
      this.setVolumes(this.volumes);
    }
    await this.context.resume();
    if (!this.song) this.play(this.desired);
  }
  setVolumes(
    v: Volumes | number,
    music?: number,
    sfx?: number,
    ambience?: number,
  ) {
    const input =
      typeof v === "number" ? { master: v, music, sfx, ambience } : v;
    for (const key of ["master", "music", "sfx", "ambience"] as const) {
      const value = input[key];
      if (value !== undefined)
        this.volumes[key] = Math.max(0, Math.min(1, value));
      const bus = key === "sfx" ? this.effect : this[key];
      if (bus && this.context)
        bus.gain.setTargetAtTime(
          this.volumes[key],
          this.context.currentTime,
          0.04,
        );
    }
  }
  play(track: string) {
    const id = aliases[track] ?? track;
    this.desired = id;
    const song = songById.get(id) ?? songById.get("spring")!;
    if (!this.context || !this.music || this.song?.id === song.id) return;
    const c = this.context;
    if (this.trackBus) {
      const old = this.trackBus;
      old.gain.cancelScheduledValues(c.currentTime);
      old.gain.setTargetAtTime(0, c.currentTime, 0.25);
      setTimeout(() => old.disconnect(), 1800);
    }
    this.trackBus = c.createGain();
    this.trackBus.gain.setValueAtTime(0, c.currentTime);
    this.trackBus.gain.linearRampToValueAtTime(1, c.currentTime + 0.8);
    this.trackBus.connect(this.music);
    this.song = song;
    this.orderIndex = 0;
    this.nextBar = c.currentTime + 0.04;
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.schedule(), 50);
    this.schedule();
  }
  private schedule() {
    if (!this.context || !this.song || !this.trackBus || this.stopped) return;
    const song = this.song,
      c = this.context;
    while (this.nextBar < c.currentTime + 0.25) {
      const pattern = song.patterns[song.order[this.orderIndex]!]!;
      for (const channel of Object.keys(pattern.channels) as Channel[])
        for (const note of pattern.channels[channel]) {
          const beat = 60 / song.tempo / 4;
          const start =
            this.nextBar +
            (note.step + (Math.floor(note.step) % 2 ? song.swing : 0)) * beat;
          this.note(channel, note, start, beat, song, this.trackBus);
        }
      this.nextBar += (60 / song.tempo) * 4;
      this.orderIndex++;
      if (this.orderIndex >= song.order.length) {
        if (song.jingle) {
          this.song = null;
          if (this.timer) clearInterval(this.timer);
          this.timer = null;
          break;
        }
        this.orderIndex = 0;
      }
    }
  }
  private periodic(duty: number, wave = -1) {
    const key = `${duty}:${wave}`;
    let result = this.waves.get(key);
    if (!result && this.context) {
      const real = new Float32Array(33),
        imag = new Float32Array(33);
      for (let n = 1; n < 33; n++) {
        if (wave < 0) {
          real[n] = (2 * Math.sin(2 * Math.PI * n * duty)) / (Math.PI * n);
          imag[n] =
            (2 * (1 - Math.cos(2 * Math.PI * n * duty))) / (Math.PI * n);
        } else
          imag[n] =
            wave === 0
              ? 1 / (n * n)
              : wave === 1
                ? n % 2
                  ? 1 / (n * n)
                  : 0
                : n < 5
                  ? 1 / (n * n)
                  : 0;
      }
      result = this.context.createPeriodicWave(real, imag);
      this.waves.set(key, result);
    }
    return result!;
  }
  private track(source: AudioScheduledSourceNode, start: number, end: number) {
    this.sources.add(source);
    source.onended = () => {
      source.disconnect();
      this.sources.delete(source);
    };
    source.start(start);
    source.stop(end);
  }
  private note(
    channel: Channel,
    note: Note,
    start: number,
    beat: number,
    song: Song,
    bus: GainNode,
  ) {
    const c = this.context!;
    const duration = note.length * beat,
      gain = c.createGain();
    gain.connect(bus);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(note.velocity * 0.12, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, note.velocity * 0.075),
      start + duration * 0.5,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration + 0.06);
    if (channel === "noise") {
      const source = c.createBufferSource();
      source.buffer = this.noise;
      const filter = c.createBiquadFilter();
      filter.type = note.pitch < 60 ? "lowpass" : "highpass";
      filter.frequency.value = note.pitch < 60 ? 180 : 5500;
      source.connect(filter);
      filter.connect(gain);
      source.playbackRate.value = note.pitch < 60 ? 0.5 : 1;
      this.track(source, start, start + duration + 0.07);
      return;
    }
    const source = c.createOscillator();
    source.frequency.setValueAtTime(hz(note.pitch), start);
    if (channel === "triangle") source.type = "triangle";
    else
      source.setPeriodicWave(
        this.periodic(
          channel === "pulseB" ? 0.5 : song.duty,
          channel === "wave" ? song.wave : -1,
        ),
      );
    if (note.slide)
      source.frequency.exponentialRampToValueAtTime(
        hz(note.pitch + note.slide),
        start + duration,
      );
    if (note.arpeggio)
      for (let i = 1; i < Math.floor(duration / 0.05); i++)
        source.frequency.setValueAtTime(
          hz(note.pitch + note.arpeggio[i % note.arpeggio.length]!),
          start + i * 0.05,
        );
    if (note.vibrato) {
      const lfo = c.createOscillator(),
        depth = c.createGain();
      lfo.frequency.value = 5.2;
      depth.gain.value = note.vibrato;
      lfo.connect(depth);
      depth.connect(source.detune);
      this.track(lfo, start, start + duration + 0.08);
    }
    source.connect(gain);
    this.track(source, start, start + duration + 0.08);
  }
  sfx(name: string) {
    const actionSounds: Record<string, string> = {
      hoe: "till",
      can: "water",
      rod: "cast",
      seeds: "sow",
      hand: "harvest",
      collect: "item_get",
      upgradeTool: "upgrade",
      buyAnimal: "shop_bell",
      refill: "water",
      gift: "heart",
      decorate: "build",
      process: "bubble",
      forage: "harvest",
      discover: "rare_item",
      story: "lantern",
      quest: "quest",
    };
    name = actionSounds[name] ?? name;
    if (!this.context || !this.effect) return;
    if (songById.get(name)?.jingle) {
      const jingle = songById.get(name)!;
      const now = this.context.currentTime;
      this.duck(jingle.duration);
      for (const [channel, notes] of Object.entries(
        jingle.patterns[0]!.channels,
      ))
        for (const note of notes)
          this.note(
            channel as Channel,
            note,
            now + (note.step * 60) / jingle.tempo / 4,
            60 / jingle.tempo / 4,
            jingle,
            this.effect,
          );
      return;
    }
    const aliases: Record<string, string> = {
      select: "menu_select",
      cancel: "menu_cancel",
      error: "menu_error",
      move: "menu_move",
      plant: "sow",
      fish: "cast",
      mine: "hammer",
      buy: "coins",
      sell: "coins",
      ship: "shipping",
      talk: "voice_1",
      care: "brush",
      collect: "item_get",
      step: "step_grass",
    };
    const e = effectById.get(aliases[name] ?? name);
    if (!e) return;
    const c = this.context,
      now = c.currentTime,
      ambient = ["rain", "wind", "crickets", "fireplace", "crowd"].includes(
        e.id,
      ),
      gain = c.createGain();
    gain.connect(ambient ? this.ambience! : this.effect);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(e.volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + e.duration);
    if (e.type === "noise") {
      const source = c.createBufferSource();
      source.buffer = this.noise;
      const filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(e.frequency, now);
      filter.frequency.exponentialRampToValueAtTime(e.end, now + e.duration);
      source.connect(filter);
      filter.connect(gain);
      this.track(source, now, now + e.duration);
    } else {
      const source = c.createOscillator();
      source.type = e.type;
      source.frequency.setValueAtTime(e.frequency, now);
      source.frequency.exponentialRampToValueAtTime(e.end, now + e.duration);
      if (e.tremolo) {
        const trem = c.createOscillator(),
          depth = c.createGain();
        trem.frequency.value = e.tremolo;
        depth.gain.value = e.frequency * 0.12;
        trem.connect(depth);
        depth.connect(source.frequency);
        this.track(trem, now, now + e.duration);
      }
      source.connect(gain);
      this.track(source, now, now + e.duration);
    }
    if (["catch", "rare_item", "heart", "quest"].includes(name)) this.duck(0.6);
  }
  private duck(duration: number) {
    if (!this.context || !this.music) return;
    const t = this.context.currentTime;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setTargetAtTime(this.volumes.music * 0.35, t, 0.03);
    this.music.gain.setTargetAtTime(this.volumes.music, t + duration, 0.2);
  }
  pause() {
    this.stopped = true;
    void this.context?.suspend();
  }
  resume() {
    this.stopped = false;
    void this.context?.resume();
  }
  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* A finished source needs no further stop. */
      }
    }
    this.sources.clear();
    void this.context?.close();
    this.context = null;
    this.song = null;
    this.waves.clear();
  }
}
