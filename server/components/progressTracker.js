// server/components/progressTracker.js
const axios = require('axios');

class ProgressTracker {
  constructor(sdWebUIUrl) {
    this.sdWebUIUrl = sdWebUIUrl;
    this.currentJob = null;
    this.progressHistory = [];
  }

  /**
   * Get current generation progress from SD WebUI
   */
  async getSDProgress() {
    try {
      const response = await axios.get(
        `${this.sdWebUIUrl}/sdapi/v1/progress?skip_current_image=true`,
        { timeout: 3000 }
      );

      const data = response.data;
      
      return {
        progress: data.progress || 0,
        eta: data.eta_relative || 0,
        currentStep: data.state?.sampling_step || 0,
        totalSteps: data.state?.sampling_steps || 0,
        jobCount: data.state?.job_count || 0,
        jobNo: data.state?.job_no || 0,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        progress: 0,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Start tracking a new job
   */
  startJob(jobData) {
    this.currentJob = {
      id: Date.now(),
      ...jobData,
      startTime: new Date(),
      status: 'running',
      currentScene: 0,
      totalScenes: jobData.totalScenes || 0
    };

    console.log(`📊 Started tracking job: ${this.currentJob.id}`);
    return this.currentJob.id;
  }

  /**
   * Update job progress
   */
  updateProgress(update) {
    if (this.currentJob) {
      this.currentJob = {
        ...this.currentJob,
        ...update,
        lastUpdate: new Date()
      };

      this.progressHistory.push({
        timestamp: new Date(),
        ...update
      });
    }
  }

  /**
   * Complete current job
   */
  completeJob(result) {
    if (this.currentJob) {
      this.currentJob.status = 'completed';
      this.currentJob.endTime = new Date();
      this.currentJob.duration = this.currentJob.endTime - this.currentJob.startTime;
      this.currentJob.result = result;

      console.log(`✅ Job completed: ${this.currentJob.id} (${this.currentJob.duration}ms)`);
    }
  }

  /**
   * Mark job as failed
   */
  failJob(error) {
    if (this.currentJob) {
      this.currentJob.status = 'failed';
      this.currentJob.endTime = new Date();
      this.currentJob.error = error.message;

      console.log(`❌ Job failed: ${this.currentJob.id}`);
    }
  }

  /**
   * Get current job status
   */
  getCurrentStatus() {
    return this.currentJob || { status: 'idle' };
  }

  /**
   * Get progress history
   */
  getHistory(limit = 10) {
    return this.progressHistory.slice(-limit);
  }

  /**
   * Clear completed jobs
   */
  clearHistory() {
    this.progressHistory = [];
    this.currentJob = null;
  }

  /**
   * Calculate estimated time remaining
   */
  calculateETA(currentScene, totalScenes, avgTimePerScene) {
    const remainingScenes = totalScenes - currentScene;
    const etaSeconds = remainingScenes * avgTimePerScene;
    
    return {
      remainingScenes,
      etaSeconds,
      etaFormatted: this.formatDuration(etaSeconds)
    };
  }

  /**
   * Format duration in human-readable format
   */
  formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  }
}

module.exports = ProgressTracker;
