CREATE OR REPLACE FUNCTION encrypt_with_public_key(
    p_text IN VARCHAR2,
    p_public_key_hex IN VARCHAR2
) RETURN VARCHAR2 IS
    v_public_key_raw RAW(2000);
    v_text_raw RAW(2000);
    v_encrypted RAW(2000);
BEGIN
    -- Converter a chave pública de hexadecimal para RAW
    v_public_key_raw := HEXTORAW(p_public_key_hex);
    
    -- Converter o texto para RAW (binário)
    v_text_raw := UTL_I18N.STRING_TO_RAW(p_text, 'AL32UTF8');
    
    -- Criptografar usando RSA com padding PKCS1
    v_encrypted := DBMS_CRYPTO.ENCRYPT(
        src => v_text_raw,
        typ => DBMS_CRYPTO.ENCRYPT_RSA_PKCS1,
        key => v_public_key_raw
    );
    
    -- Retornar o resultado em hexadecimal
    RETURN RAWTOHEX(v_encrypted);
EXCEPTION
    WHEN OTHERS THEN
        RETURN 'ERROR: ' || SQLERRM || ' (Oracle Error: ' || SQLCODE || ')';
END encrypt_with_public_key;