from flask import Flask
from frontend import frontend_bp
from api import api_bp

app = Flask(__name__)

app.register_blueprint(frontend_bp)
app.register_blueprint(api_bp)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8889)
