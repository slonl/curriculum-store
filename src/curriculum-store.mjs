import simplystore from '@muze-nl/simplystore'
import process from 'node:process'
import { exec } from 'node:child_process';

const datafile     = process.env.DATA_FILE || './data/data.jsontag'
const schemaFile   = process.env.SCHEMA_FILE || './data/schema.jsontag'
const commandsFile = process.env.COMMANDS || process.cwd()+'/src/commands.mjs'
const port         = process.env.NODE_PORT || 3000

/**
 * Function to check if a specific process is running using PM2
 * @param {string} simplystore - The name of the PM2 process to check
 * @returns {Promise<Object>} - Process status information
 */
async function checkProcessStatus(processName) {
  return new Promise((resolve, reject) => {
    exec('pm2 jlist', (error, stdout, stderr) => {
      if (error) {
        return reject(`Error executing PM2 command: ${error.message}`);
      }
      
      if (stderr) {
        return reject(`PM2 stderr: ${stderr}`);
      }
      
      try {
        const processes = JSON.parse(stdout);
        const targetProcess = processes.find(process => process.name === processName);
        
        if (targetProcess) {
          resolve({
            running: targetProcess.pm2_env.status === 'online',
            pid: targetProcess.pid,
            status: targetProcess.pm2_env.status,
            uptime: targetProcess.pm2_env.pm_uptime,
            restarts: targetProcess.pm2_env.restart_time
          });
        } else {
          resolve({ running: false });
        }
      } catch (parseError) {
        reject(`Error parsing PM2 output: ${parseError.message}`);
      }
    });
  });
}

/**
 * Lists all processes managed by PM2
 * @returns {Promise<Array>} - Array of PM2 processes with status information
 */
async function listPM2Processes() {
  return new Promise((resolve, reject) => {
    exec('pm2 jlist', (error, stdout, stderr) => {
      if (error) {
        return reject(`Error executing PM2 command: ${error.message}`);
      }
      
      try {
        const processes = JSON.parse(stdout);
        const simplifiedProcesses = processes.map(process => ({
          name: process.name,
          status: process.pm2_env.status,
          pid: process.pid,
          cpu: process.monit?.cpu,
          memory: process.monit?.memory
        }));
        
        resolve(simplifiedProcesses);
      } catch (parseError) {
        reject(`Failed to parse PM2 output: ${parseError.message}`);
      }
    });
  });
}

// Export commands to be used by SimplyStore
export default {
  /**
   * Get status of a specific PM2 process
   */
  async getProcessStatus(req, res) {
    try {
      const processName = req.params.processName;
      if (!processName) {
        return res.status(400).json({ error: 'Process name is required' });
      }
      
      const status = await checkProcessStatus(processName);
      return res.json(status);
    } catch (error) {
      return res.status(500).json({ error: error.toString() });
    }
  },
  
  /**
   * Get list of all PM2 processes
   */
  async listProcesses(req, res) {
    try {
      const processes = await listPM2Processes();
      return res.json(processes);
    } catch (error) {
      return res.status(500).json({ error: error.toString() });
    }
  },
  
  /**
   * Check if a PM2 process is running (returns boolean)
   */
  async isProcessRunning(req, res) {
    try {
      const processName = req.params.processName;
      if (!processName) {
        return res.status(400).json({ error: 'Process name is required' });
      }
      
      const status = await checkProcessStatus(processName);
      return res.json({ running: status.running });
    } catch (error) {
      return res.status(500).json({ error: error.toString() });
    }
  }
};

simplystore.run({
	datafile,
	schemaFile,
	port,
	commandsFile,
})