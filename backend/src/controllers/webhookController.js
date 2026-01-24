class WebhookController {
  async updateApp(req, res, next) {
    try {
      const exec = require('child_process').exec;
      
      exec('bash /var/www/your-app/update.sh', (error, stdout, stderr) => {
        if (error) {
          console.error(`Error updating app: ${error}`);
          return res.status(500).json({ 
            error: 'Update failed', 
            details: error.message 
          });
        }
        
        console.log(`App updated successfully: ${stdout}`);
        res.json({ 
          success: true, 
          message: 'Application updated successfully' 
        });
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new WebhookController();