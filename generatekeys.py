from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.backends import default_backend
import os
import binascii

def generate_aes_key(key_length=32):
    """
    Gera uma chave AES segura (256 bits por padrão)
    Retorna a chave em formato hexadecimal
    """
    # Gera bytes aleatórios seguros
    key = os.urandom(key_length)
    
    # Converte para hexadecimal
    hex_key = binascii.hexlify(key).decode('utf-8')
    
    return hex_key

def generate_keys_from_password(password, salt=None, key_length=32):
    """
    Gera uma chave AES a partir de uma senha (usando PBKDF2)
    Retorna a chave em formato hexadecimal
    """
    if salt is None:
        salt = os.urandom(16)  # Gera um salt aleatório
    
    # Usa PBKDF2 para derivar a chave
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=key_length,
        salt=salt,
        iterations=100000,
        backend=default_backend()
    )
    
    key = kdf.derive(password.encode('utf-8'))
    hex_key = binascii.hexlify(key).decode('utf-8')
    
    return hex_key

if __name__ == "__main__":
    print("Opções:")
    print("1. Gerar chave AES aleatória (recomendado)")
    print("2. Gerar chave AES a partir de uma senha")
    
    choice = input("Escolha uma opção (1 ou 2): ")
    
    if choice == "1":
        # Gera chave AES 256-bit (32 bytes)
        aes_key = generate_aes_key(32)
        print("\nChave AES gerada (hexadecimal):")
        print(aes_key)
        print("\nGuarde esta chave com segurança!")
        
    elif choice == "2":
        password = input("Digite uma senha forte: ")
        aes_key = generate_keys_from_password(password)
        print("\nChave AES derivada da senha (hexadecimal):")
        print(aes_key)
        print("\nGuarde esta chave com segurança!")
        
    else:
        print("Opção inválida. Execute novamente.")