// SPDX-License-Identifier: GPL-2.0-only
// Adapted from emulators 8.5.2 src/dos/dosbox/ts/audio-worklet.ts.
// https://github.com/js-dos/emulators (license also shipped in vendor/).
// Mono resampling plus overlap/add corrects timing drift without changing pitch.

class SampleRing {
    constructor(capacity) {
        this.samples = new Float32Array(capacity);
        this.readPosition = 0;
        this.writePosition = 0;
        this.samplesCount = 0;
        this.droppedFrames = 0;
    }

    clear() {
        this.readPosition = 0;
        this.writePosition = 0;
        this.samplesCount = 0;
    }

    length() {
        return this.samplesCount;
    }

    push(sample) {
        if (this.samplesCount === this.samples.length) {
            this.discard(1);
            this.droppedFrames++;
        }
        this.samples[this.writePosition] = sample;
        this.writePosition = (this.writePosition + 1) % this.samples.length;
        this.samplesCount++;
    }

    pushArray(samples) {
        for (let i = 0; i < samples.length; ++i) {
            this.push(samples[i]);
        }
    }

    peek(offset) {
        return this.samples[(this.readPosition + offset) % this.samples.length];
    }

    shift() {
        const sample = this.peek(0);
        this.discard(1);
        return sample;
    }

    discard(count) {
        count = Math.min(count, this.samplesCount);
        this.readPosition = (this.readPosition + count) % this.samples.length;
        this.samplesCount -= count;
    }
}

export class PcmQueue {
    constructor(outputRate, {bufferSeconds=.18, maxSeconds=.65, adaptive=true}={}) {
        this.outputRate = outputRate;
        this.sourceRate = outputRate;
        this.adaptive = adaptive;
        this.targetFrames = Math.max(1024, Math.round(outputRate * bufferSeconds));
        this.maxFrames = Math.max(this.targetFrames*2, Math.round(outputRate * maxSeconds));
        this.underruns=0;this.inputSamples=0;this.outputSamples=0;
        this.frameSize = 512;
        this.hopSize = this.frameSize / 2;
        this.searchSize = 64;
        this.sourceQueue = new SampleRing(this.maxFrames * 4);
        this.queue = new SampleRing(this.maxFrames);
        this.outputQueue = new SampleRing(this.frameSize * 4);
        this.tail = new Float32Array(this.hopSize);
        this.sourcePosition = 0;
        this.tempo = 1;
        this.analysisDebt = 0;
        this.started = false;
        this.haveTail = false;
        this.lastOutput = 0;

    }

    push(samples, rate) {
        if (!samples.length || !Number.isFinite(rate) || rate<8000 || rate>192000) return;
        if (rate!==this.sourceRate) this.initialize(rate);
        this.inputSamples+=samples.length;
        this.sourceQueue.pushArray(samples);
        this.resampleInput();
    }
    reset() { this.initialize(this.sourceRate); }
    render(output) {
        if (output.length<=128) { this.writeTo(output); return; }
        for(let i=0;i<output.length;i+=128) this.writeTo(output.subarray(i,i+128));
    }
    stats() {
        const dropped=this.queue.droppedFrames+this.sourceQueue.droppedFrames*this.outputRate/this.sourceRate;
        return {rate:this.sourceRate,queuedMs:this.bufferedFrames()/this.outputRate*1000,
            underruns:this.underruns,overruns:this.queue.droppedFrames+this.sourceQueue.droppedFrames,droppedFrames:dropped,
            inputSamples:this.inputSamples,outputSamples:this.outputSamples,tempo:this.tempo};
    }

    initialize(sourceRate) {
        this.sourceRate = sourceRate > 0 ? sourceRate : this.outputRate;
        this.sourceQueue.clear();
        this.queue.clear();
        this.outputQueue.clear();
        this.sourcePosition = 0;
        this.tempo = 1;
        this.analysisDebt = 0;
        this.started = false;
        this.haveTail = false;
        this.lastOutput = 0;
    }

    resampleInput() {
        const step = this.sourceRate / this.outputRate;
        while (this.sourcePosition + 1 < this.sourceQueue.length()) {
            const index = Math.floor(this.sourcePosition);
            const fraction = this.sourcePosition - index;
            const first = this.sourceQueue.peek(index);
            const second = this.sourceQueue.peek(index + 1);
            this.queue.push(first + (second - first) * fraction);
            this.sourcePosition += step;
        }

        const consumed = Math.floor(this.sourcePosition);
        if (consumed > 0) {
            this.sourceQueue.discard(consumed);
            this.sourcePosition -= consumed;
        }
    }

    prepareFirstFrame() {
        if (this.queue.length() < this.frameSize) {
            return false;
        }
        for (let i = 0; i < this.hopSize; ++i) {
            this.outputQueue.push(this.queue.peek(i) * (i + 1) / this.hopSize);
            this.tail[i] = this.queue.peek(this.hopSize + i);
        }
        this.haveTail = true;
        return true;
    }

    updateTempo() {
        if (!this.adaptive) { this.tempo=1; return; }
        const error = (this.queue.length() - this.targetFrames) / this.targetFrames;
        const desired = Math.max(0.85, Math.min(1.2, 1 + error * 0.35));
        const change = Math.max(-0.002, Math.min(0.002, desired - this.tempo));
        this.tempo += change;
    }

    findBestFrame(expected) {
        const minimum = Math.max(1, expected - this.searchSize);
        const maximum = Math.min(
            expected + this.searchSize,
            this.queue.length() - this.frameSize,
        );
        if (maximum < minimum) {
            return -1;
        }

        let bestPosition = Math.min(expected, maximum);
        let bestScore = Number.POSITIVE_INFINITY;
        for (let position = minimum; position <= maximum; ++position) {
            let difference = 0;
            for (let i = 0; i < this.hopSize; i += 4) {
                const delta = this.tail[i] - this.queue.peek(position + i);
                difference += delta * delta;
            }
            const distancePenalty = Math.abs(position - expected) * 0.002;
            const score = difference + distancePenalty;
            if (score < bestScore) {
                bestScore = score;
                bestPosition = position;
            }
        }
        return bestPosition;
    }

    generateFrame() {
        if (!this.haveTail) {
            return this.prepareFirstFrame();
        }

        this.updateTempo();
        const idealAdvance = this.hopSize * this.tempo;
        const expected = Math.max(1, Math.round(idealAdvance + this.analysisDebt));
        const position = this.findBestFrame(expected);
        if (position < 0) {
            return false;
        }
        this.analysisDebt += idealAdvance - position;
        this.analysisDebt = Math.max(-this.searchSize, Math.min(this.searchSize, this.analysisDebt));

        this.queue.discard(position);
        for (let i = 0; i < this.hopSize; ++i) {
            const mix = i / this.hopSize;
            const sample = this.tail[i] * (1 - mix) + this.queue.peek(i) * mix;
            this.outputQueue.push(sample);
            this.tail[i] = this.queue.peek(this.hopSize + i);
        }
        return true;
    }

    stopForUnderflow() {
        this.underruns++;
        if (this.haveTail) {
            this.queue.discard(this.hopSize);
        }
        this.started = false;
        this.haveTail = false;
        this.outputQueue.clear();
        this.tempo = 1;
        this.analysisDebt = 0;
    }

    writeTo(output) {
        if (!this.started && this.queue.length() >= this.targetFrames) {
            this.started = true;
        }

        while (this.started && this.outputQueue.length() < output.length) {
            if (!this.generateFrame()) {
                break;
            }
        }

        let written = 0;
        while (written < output.length && this.outputQueue.length() > 0) {
            this.lastOutput = this.outputQueue.shift();
            output[written++] = this.lastOutput;
        }

        this.outputSamples+=written;
        if (written < output.length) {
            const missing = output.length - written;
            for (let i = 0; i < missing; ++i) {
                output[written + i] = this.lastOutput * (1 - (i + 1) / missing);
            }
            this.lastOutput = 0;
            if (this.started) {
                this.stopForUnderflow();
            }
        }
    }

    bufferedFrames() {
        return this.queue.length() + this.outputQueue.length();
    }

}
