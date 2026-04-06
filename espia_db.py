from app import app, db, Usuario, Conversacion, Mensaje, FraseRapida

def ver_usuarios():
    with app.app_context():
        usuarios = Usuario.query.all()
        print("\n--- 👥 TABLA: USUARIOS ---")
        if not usuarios: print("No hay usuarios.")
        for u in usuarios:
            print(f"ID: {u.id} | Nombre: {u.nombre} {u.apellido} | Correo: {u.correo} | Rol: {u.tipo_usuario}")
            print(f"Bcrypt Hash: {u.password_hash}")
            print("-" * 50)

def ver_conversaciones():
    with app.app_context():
        convs = Conversacion.query.all()
        print("\n--- 💬 TABLA: CONVERSACIONES ---")
        if not convs: print("No hay conversaciones.")
        for c in convs:
            print(f"ID: {c.id} | Usuario ID: {c.usuario_id} | Título: {c.titulo}")
            print(f"Preview: {c.preview} | Pinned: {c.pinned}")
            print("-" * 50)

def ver_mensajes():
    with app.app_context():
        mensajes = Mensaje.query.all()
        print("\n--- 🔒 TABLA: MENSAJES (ENCRIPTADOS) ---")
        if not mensajes: print("No hay mensajes.")
        for m in mensajes:
            print(f"ID: {m.id} | Conv ID: {m.conversacion_id} | De: {m.remitente}")
            print(f"AES-256 Cifrado: {m.texto}")
            print("-" * 50)

def ver_frases():
    with app.app_context():
        frases = FraseRapida.query.all()
        print("\n--- 🔒 TABLA: FRASES RÁPIDAS (ENCRIPTADAS) ---")
        if not frases: print("No hay frases.")
        for f in frases:
            print(f"ID: {f.id} | Usuario ID: {f.usuario_id}")
            print(f"AES-256 Cifrado: {f.texto}")
            print("-" * 50)

def mostrar_menu():
    while True:
        print("\n" + "="*45)
        print("🕵️‍♂️ TEXTIFY DB SPY - MENÚ PRINCIPAL 🕵️‍♂️")
        print("="*45)
        print("1. Ver Usuarios")
        print("2. Ver Conversaciones")
        print("3. Ver Mensajes")
        print("4. Ver Frases Rápidas")
        print("5. Salir")
        print("="*45)
        
        opcion = input("Elige una opción (1-5): ")
        
        if opcion == '1':
            ver_usuarios()
        elif opcion == '2':
            ver_conversaciones()
        elif opcion == '3':
            ver_mensajes()
        elif opcion == '4':
            ver_frases()
        elif opcion == '5':
            print("Cerrando conexión... ¡Sigue programando con todo!")
            break
        else:
            print("⚠️ Opción no válida. Intenta de nuevo.")

if __name__ == '__main__':
    # Esto arranca el menú interactivo en la terminal
    mostrar_menu()