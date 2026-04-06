from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt # <-- 1. Nueva importación
from datetime import datetime
from Crypto.Cipher import AES
import base64
import os
import json

app = Flask(__name__)

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///textify.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
bcrypt = Bcrypt(app) # <-- 2. Inicializamos Bcrypt
# ==========================================
# MOTOR DE SEGURIDAD AES-256
# ==========================================
# Una llave AES-256 exige exactamente 32 bytes (caracteres). 
# NOTA: Por ahora la ponemos aquí, pero en el futuro (Fase 4) la pasaremos a un archivo .env
LLAVE_AES = b'TexT1fy_S3cur3_K3y_2026_xYz!9876' 

def encriptar_aes(texto_plano):
    # Usamos GCM, que es un modo moderno y muy seguro de AES
    cipher = AES.new(LLAVE_AES, AES.MODE_GCM)
    ciphertext, tag = cipher.encrypt_and_digest(texto_plano.encode('utf-8'))
    # Juntamos los pedazos y los convertimos a texto legible (base64) para la Base de Datos
    return base64.b64encode(cipher.nonce + tag + ciphertext).decode('utf-8')

def desencriptar_aes(texto_cifrado):
    try:
        raw = base64.b64decode(texto_cifrado)
        nonce, tag, ciphertext = raw[:16], raw[16:32], raw[32:]
        cipher = AES.new(LLAVE_AES, AES.MODE_GCM, nonce)
        return cipher.decrypt_and_verify(ciphertext, tag).decode('utf-8')
    except Exception as e:
        return "[Error: Datos corruptos o llave incorrecta]"
    
# ==========================================
# MODELOS DE LA BASE DE DATOS (Las Tablas)
# ==========================================

class Usuario(db.Model):
    __tablename__ = 'usuarios'
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(50), nullable=False)
    apellido = db.Column(db.String(50), nullable=False)
    correo = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    tipo_usuario = db.Column(db.String(20), nullable=False) 
    configuraciones = db.Column(db.Text, nullable=True) 

    conversaciones = db.relationship('Conversacion', backref='usuario', lazy=True)
    frases = db.relationship('FraseRapida', backref='usuario', lazy=True)

class Conversacion(db.Model):
    __tablename__ = 'conversaciones'
    id = db.Column(db.Integer, primary_key=True)
    usuario_id = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=False)
    titulo = db.Column(db.String(100), nullable=False)
    preview = db.Column(db.String(150), nullable=True)
    pinned = db.Column(db.Boolean, default=False)
    fecha_actualizacion = db.Column(db.DateTime, default=datetime.utcnow)

    mensajes = db.relationship('Mensaje', backref='conversacion', lazy=True)

class Mensaje(db.Model):
    __tablename__ = 'mensajes'
    id = db.Column(db.Integer, primary_key=True)
    conversacion_id = db.Column(db.Integer, db.ForeignKey('conversaciones.id'), nullable=False)
    remitente = db.Column(db.String(50), nullable=False) 
    texto = db.Column(db.Text, nullable=False)
    tipo_input = db.Column(db.String(50), nullable=False) 
    fecha_hora = db.Column(db.DateTime, default=datetime.utcnow)

class FraseRapida(db.Model):
    __tablename__ = 'frases_rapidas'
    id = db.Column(db.Integer, primary_key=True)
    usuario_id = db.Column(db.Integer, db.ForeignKey('usuarios.id'), nullable=False)
    texto = db.Column(db.String(200), nullable=False)

# ==========================================
# RUTAS DE LA APLICACIÓN
# ==========================================

@app.route('/')
def index():
    return render_template('index.html')

# ---> AQUÍ ESTÁ LA RUTA QUE FALTABA <---
@app.route('/api/registro', methods=['POST'])
def registro():
    datos = request.get_json() 
    
    try:
        # 3. Encriptamos la contraseña antes de guardarla
        hashed_pw = bcrypt.generate_password_hash(datos['password']).decode('utf-8')
        
        nuevo_usuario = Usuario(
            nombre=datos['nombre'],
            apellido=datos['apellido'],
            correo=datos['correo'],
            password_hash=hashed_pw, # <-- Pasamos la contraseña ya encriptada
            tipo_usuario=datos['tipo_usuario']
        )
        
        db.session.add(nuevo_usuario)
        db.session.commit()
        
        return jsonify({'mensaje': 'Cuenta creada exitosamente'}), 201
        
    except Exception as e:
        return jsonify({'error': 'El correo ya existe o hubo un error.'}), 400

# API para iniciar sesión
@app.route('/api/login', methods=['POST'])
def login():
    datos = request.get_json()
    correo = datos.get('correo')
    password = datos.get('password')

    # 1. Buscamos al usuario por su correo en la base de datos
    usuario = Usuario.query.filter_by(correo=correo).first()

    # 2. Verificamos que el usuario exista y que la contraseña coincida con el hash
    if usuario and bcrypt.check_password_hash(usuario.password_hash, password):
        # Si todo está bien, le mandamos sus datos básicos al frontend
        return jsonify({
            'mensaje': 'Inicio de sesión exitoso',
            'usuario': {
                'id': usuario.id,
                'nombre': usuario.nombre,
                'tipo_usuario': usuario.tipo_usuario,
                # AGREGAR ESTA LÍNEA:
                'configuraciones': usuario.configuraciones 
            }
        }), 200
    else:
        # Si falla el correo o la contraseña, arrojamos error 401 (No autorizado)
        return jsonify({'error': 'Correo o contraseña incorrectos'}), 401
    
# API para crear una nueva frase rápida
@app.route('/api/frases', methods=['POST'])
def crear_frase():
    datos = request.get_json()
    usuario_id = datos.get('usuario_id') # Quién está creando la frase
    texto_original = datos.get('texto')  # Lo que escribió en la pantalla

    # ¡Aplicamos la doble seguridad!
    texto_seguro = encriptar_aes(texto_original)

    try:
        nueva_frase = FraseRapida(
            usuario_id=usuario_id,
            texto=texto_seguro # Guardamos la versión encriptada, NO la original
        )
        db.session.add(nueva_frase)
        db.session.commit()

        # En la respuesta te devuelvo cómo se ve encriptado para que lo veas en consola
        return jsonify({
            'mensaje': 'Frase guardada de forma segura.',
            'texto_guardado_en_bd': texto_seguro 
        }), 201
    except Exception as e:
        return jsonify({'error': 'No se pudo guardar la frase'}), 400

# API para obtener y desencriptar las frases de un usuario
@app.route('/api/frases/<int:usuario_id>', methods=['GET'])
def obtener_frases(usuario_id):
    # Buscamos todas las frases de este usuario en la BD
    frases_bd = FraseRapida.query.filter_by(usuario_id=usuario_id).all()
    
    frases_limpias = []
    for frase in frases_bd:
        # ¡Magia! Desencriptamos cada frase antes de enviarla al frontend
        texto_claro = desencriptar_aes(frase.texto)
        frases_limpias.append(texto_claro)
        
    return jsonify({'frases': frases_limpias}), 200

# ==========================================
# RUTAS DE CHAT (CONVERSACIONES Y MENSAJES)
# ==========================================

# 1. Obtener todas las conversaciones de un usuario
@app.route('/api/conversaciones/<int:usuario_id>', methods=['GET'])
def obtener_conversaciones(usuario_id):
    convs = Conversacion.query.filter_by(usuario_id=usuario_id).order_by(Conversacion.fecha_actualizacion.desc()).all()
    # Convertimos los objetos a un formato que JavaScript entienda (diccionarios)
    res = [{'id': c.id, 'titulo': c.titulo, 'preview': c.preview, 'pinned': c.pinned} for c in convs]
    return jsonify({'conversaciones': res}), 200

# 2. Crear una nueva conversación vacía
@app.route('/api/conversaciones', methods=['POST'])
def crear_conversacion():
    datos = request.get_json()
    nueva_conv = Conversacion(
        usuario_id=datos['usuario_id'],
        titulo=datos.get('titulo', 'Nueva conversación'),
        preview='Sin mensajes'
    )
    db.session.add(nueva_conv)
    db.session.commit()
    return jsonify({'id': nueva_conv.id, 'titulo': nueva_conv.titulo, 'preview': nueva_conv.preview}), 201

# 3. Guardar un mensaje (¡Con encriptación AES-256!)
@app.route('/api/mensajes', methods=['POST'])
def guardar_mensaje():
    datos = request.get_json()
    
    # Blindamos el mensaje antes de que toque la base de datos
    texto_seguro = encriptar_aes(datos['texto'])
    
    nuevo_msg = Mensaje(
        conversacion_id=datos['conversacion_id'],
        remitente=datos['remitente'],
        texto=texto_seguro,
        tipo_input=datos.get('tipo_input', 'texto')
    )
    
    # Actualizamos el "preview" del chat para que el menú lateral se vea actualizado
    conv = Conversacion.query.get(datos['conversacion_id'])
    if conv:
        conv.preview = datos['texto'][:35] + "..." # Guardamos un pedacito para la vista previa
        conv.fecha_actualizacion = datetime.utcnow()
        
    db.session.add(nuevo_msg)
    db.session.commit()
    return jsonify({'mensaje': 'Mensaje guardado de forma segura'}), 201

# 4. Obtener y desencriptar los mensajes de un chat específico
@app.route('/api/mensajes/<int:conv_id>', methods=['GET'])
def obtener_mensajes(conv_id):
    mensajes = Mensaje.query.filter_by(conversacion_id=conv_id).all()
    res = []
    for m in mensajes:
        res.append({
            'id': m.id,
            'remitente': m.remitente,
            'texto': desencriptar_aes(m.texto), # ¡Magia! Lo desencriptamos al vuelo
            'tipo_input': m.tipo_input
        })
    return jsonify({'mensajes': res}), 200

# 5. Actualizar una conversación (Renombrar o Anclar)
@app.route('/api/conversaciones/<int:id>', methods=['PUT'])
def actualizar_conversacion(id):
    # Usamos session.get para evitar la advertencia de "Legacy"
    conv = db.session.get(Conversacion, id) 
    if not conv:
        return jsonify({'error': 'Conversación no encontrada'}), 404

    datos = request.get_json()
    if 'titulo' in datos:
        conv.titulo = datos['titulo']
    if 'pinned' in datos:
        conv.pinned = datos['pinned']

    db.session.commit()
    return jsonify({'mensaje': 'Conversación actualizada'}), 200

# 6. Eliminar una conversación completa
@app.route('/api/conversaciones/<int:id>', methods=['DELETE'])
def eliminar_conversacion(id):
    conv = db.session.get(Conversacion, id)
    if not conv:
        return jsonify({'error': 'Conversación no encontrada'}), 404

    # Regla de oro en BD: Antes de borrar el chat, borramos sus mensajes (para no dejar datos huérfanos)
    Mensaje.query.filter_by(conversacion_id=id).delete()
    db.session.delete(conv)
    db.session.commit()

    return jsonify({'mensaje': 'Conversación y sus mensajes eliminados'}), 200

# 7. Guardar preferencias del perfil de usuario
@app.route('/api/usuarios/<int:id>/config', methods=['PUT'])
def actualizar_configuracion(id):
    usuario = db.session.get(Usuario, id)
    if not usuario:
        return jsonify({'error': 'Usuario no encontrado'}), 404

    datos = request.get_json()
    usuario.configuraciones = json.dumps(datos)
    db.session.commit()
    
    return jsonify({'mensaje': 'Preferencias guardadas'}), 200
# ==========================================
# ARRANQUE DEL SERVIDOR
# ==========================================
if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    
    app.run(debug=True)